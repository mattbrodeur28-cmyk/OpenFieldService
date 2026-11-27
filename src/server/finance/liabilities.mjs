import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { migrate, transaction } from "../platform/sqlite.mjs";
import { ServiceIdentityError } from "../service/identity.mjs";
import { liabilitiesSchemaV1 } from "./liabilities-schema.mjs";

const uuid = z.string().uuid();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const fail = (m, s = 400) => {
  throw new ServiceIdentityError(m, s);
};
const parse = (schema, raw) => {
  const r = schema.safeParse(raw);
  if (!r.success) fail(r.error.issues[0]?.message || "Invalid finance payload.");
  return r.data;
};
const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const isAdmin = (u) => !!u?.active && ["owner", "admin"].includes(u.role);

const billInput = z.object({
  requestKey: uuid,
  supplierId: uuid.nullable().optional().default(null),
  supplierName: z.string().trim().min(1).max(160),
  purchaseOrderId: uuid.nullable().optional().default(null),
  billNumber: z.string().trim().min(1).max(80),
  billDate: ymd,
  dueDate: ymd,
  subtotalCents: z.number().int().min(0).max(1000000000),
  taxCents: z.number().int().min(0).max(1000000000).default(0),
  notes: z.string().trim().max(1000).default(""),
}).strict();

const approveInput = z.object({
  requestKey: uuid,
}).strict();

const paymentInput = z.object({
  requestKey: uuid,
  paidOn: ymd,
  amountCents: z.number().int().positive().max(1000000000),
  method: z.enum(["ach", "check", "wire", "card", "cash", "other"]).default("ach"),
  reference: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(500).default(""),
}).strict();

const creditInput = z.object({
  requestKey: uuid,
  creditedOn: ymd,
  amountCents: z.number().int().positive().max(1000000000),
  reason: z.string().trim().min(3).max(500),
  reference: z.string().trim().max(120).default(""),
}).strict();

const permInput = z.object({
  userId: z.string().trim().min(1).max(120),
  canViewFinance: z.boolean().default(false),
  canManageReceivables: z.boolean().default(false),
  canManageLiabilities: z.boolean().default(false),
  canApproveBills: z.boolean().default(false),
  canReconcileAccounting: z.boolean().default(false),
}).strict();

function agingBucket(dueDate, balanceCents) {
  if (balanceCents <= 0) return "paid";
  const today = new Date().toISOString().slice(0, 10);
  const diffDays = Math.floor((Date.parse(today + "T00:00:00Z") - Date.parse(dueDate + "T00:00:00Z")) / 86400000);
  if (diffDays <= 0) return "current";
  if (diffDays <= 30) return "1_30";
  if (diffDays <= 60) return "31_60";
  if (diffDays <= 90) return "61_90";
  return "90_plus";
}

export function createLiabilities({ storage }) {
  const db = storage.database;
  migrate(db, "_finance_liab_migrations", [{ version: 1, sql: liabilitiesSchemaV1 }]);
  const has = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);

  const hasCapability = (user, col) => {
    if (!user?.active) return false;
    if (isAdmin(user)) return true;
    // HR role never implies accounting permissions (FIN-003)
    const row = db.prepare(`SELECT ${col} AS allowed FROM _finance_permissions WHERE user_id=?`).get(user.id);
    return row?.allowed === 1;
  };
  const requireCap = (user, col, label) => {
    if (!hasCapability(user, col)) fail(`Finance permission required (${label}).`, 403);
  };

  const replay = (user, key, fp) => {
    const row = db
      .prepare("SELECT fingerprint, response_json FROM _finance_liab_idempotency WHERE request_key=? AND actor_id=?")
      .get(key, user.id);
    if (!row) return null;
    if (row.fingerprint !== fp) fail("Request key was already used with different data.", 409);
    return JSON.parse(row.response_json);
  };
  const ack = (key, user, fp, res) =>
    db
      .prepare("INSERT INTO _finance_liab_idempotency(request_key,actor_id,fingerprint,response_json) VALUES(?,?,?,?)")
      .run(key, user.id, fp, JSON.stringify(res));

  function enrichBill(b) {
    const paidCents = db
      .prepare("SELECT COALESCE(SUM(amount_cents),0) AS n FROM _finance_bill_payments WHERE bill_id=?")
      .get(b.id).n;
    const creditedCents = db
      .prepare("SELECT COALESCE(SUM(amount_cents),0) AS n FROM _finance_bill_credits WHERE bill_id=?")
      .get(b.id).n;
    const balanceCents = b.status === "void" ? 0 : Math.max(0, b.total_cents - paidCents - creditedCents);
    return {
      ...b,
      po_matched: b.po_matched === 1,
      paidCents,
      creditedCents,
      balanceCents,
      agingBucket: agingBucket(b.due_date, balanceCents),
    };
  }

  function list(user, query = {}) {
    requireCap(user, "can_view_finance", "view finance");
    const status = typeof query.status === "string" && query.status !== "all" ? query.status : "";
    const rows = (
      status
        ? db.prepare("SELECT * FROM _finance_supplier_bills WHERE status=? ORDER BY due_date ASC, created_at DESC LIMIT 200").all(status)
        : db.prepare("SELECT * FROM _finance_supplier_bills ORDER BY due_date ASC, created_at DESC LIMIT 200").all()
    ).map(enrichBill);

    const openRecognizedCents = rows
      .filter((r) => ["approved", "partially_paid"].includes(r.status))
      .reduce((s, r) => s + r.balanceCents, 0);
    const draftCents = rows.filter((r) => r.status === "draft").reduce((s, r) => s + r.total_cents, 0);
    const overdueCents = rows
      .filter((r) => ["approved", "partially_paid"].includes(r.status) && !["current", "paid"].includes(r.agingBucket))
      .reduce((s, r) => s + r.balanceCents, 0);
    const paidTotalCents = rows.reduce((s, r) => s + r.paidCents, 0);

    // Separate committed PO spend (open POs not yet fully billed) from recognized payables
    let committedPoCents = 0;
    if (has("_purch_orders") && has("_purch_lines")) {
      const poRow = db
        .prepare(
          `SELECT COALESCE(SUM(CAST(round(l.ordered_milli * l.unit_cost_cents / 1000.0) AS INTEGER)),0) AS n
           FROM _purch_lines l JOIN _purch_orders o ON o.id=l.order_id
           WHERE o.status IN ('approved','issued','partially_received')`,
        )
        .get();
      committedPoCents = poRow?.n || 0;
    }

    return {
      bills: rows,
      summary: {
        openRecognizedCents,
        draftCents,
        overdueCents,
        paidTotalCents,
        committedPoCents,
        billCount: rows.length,
      },
      capabilities: {
        canManageLiabilities: hasCapability(user, "can_manage_liabilities"),
        canApproveBills: hasCapability(user, "can_approve_bills"),
        canReconcileAccounting: hasCapability(user, "can_reconcile_accounting"),
        isAdmin: isAdmin(user),
      },
    };
  }

  function createBill(user, raw) {
    requireCap(user, "can_manage_liabilities", "manage liabilities");
    const d = parse(billInput, raw);
    const totalCents = d.subtotalCents + d.taxCents;
    if (totalCents <= 0) fail("Bill total must be greater than zero.");
    const fp = hash({ action: "fin_create_bill", ...d });
    return transaction(db, () => {
      const prior = replay(user, d.requestKey, fp);
      if (prior) return prior;
      let poMatched = 0;
      if (d.purchaseOrderId && has("_purch_orders")) {
        const po = db.prepare("SELECT id FROM _purch_orders WHERE id=?").get(d.purchaseOrderId);
        if (!po) fail("Referenced purchase order not found.", 404);
        poMatched = 1;
      }
      const id = randomUUID();
      db.prepare(
        `INSERT INTO _finance_supplier_bills(id,supplier_id,supplier_name,purchase_order_id,bill_number,bill_date,due_date,subtotal_cents,tax_cents,total_cents,status,po_matched,notes,created_by)
         VALUES(?,?,?,?,?,?,?,?,?,?,'draft',?,?,?)`,
      ).run(
        id,
        d.supplierId,
        d.supplierName,
        d.purchaseOrderId,
        d.billNumber,
        d.billDate,
        d.dueDate,
        d.subtotalCents,
        d.taxCents,
        totalCents,
        poMatched,
        d.notes,
        user.id,
      );
      const bill = enrichBill(db.prepare("SELECT * FROM _finance_supplier_bills WHERE id=?").get(id));
      const res = { bill };
      ack(d.requestKey, user, fp, res);
      return res;
    });
  }

  function approveBill(user, billId, raw) {
    requireCap(user, "can_approve_bills", "approve supplier bills");
    parse(uuid, billId);
    const d = parse(approveInput, raw);
    const fp = hash({ action: "fin_approve_bill", billId });
    return transaction(db, () => {
      const prior = replay(user, d.requestKey, fp);
      if (prior) return prior;
      const b = db.prepare("SELECT * FROM _finance_supplier_bills WHERE id=?").get(billId);
      if (!b) fail("Supplier bill not found.", 404);
      if (b.status !== "draft") fail("Only draft bills can be approved.", 409);
      db.prepare("UPDATE _finance_supplier_bills SET status='approved', approved_by=?, approved_at=datetime('now') WHERE id=?").run(user.id, billId);
      const bill = enrichBill(db.prepare("SELECT * FROM _finance_supplier_bills WHERE id=?").get(billId));
      const res = { bill };
      ack(d.requestKey, user, fp, res);
      return res;
    });
  }

  function recordPayment(user, billId, raw) {
    requireCap(user, "can_manage_liabilities", "record bill payment");
    parse(uuid, billId);
    const d = parse(paymentInput, raw);
    const fp = hash({ action: "fin_pay_bill", billId, ...d });
    return transaction(db, () => {
      const prior = replay(user, d.requestKey, fp);
      if (prior) return prior;
      const b = db.prepare("SELECT * FROM _finance_supplier_bills WHERE id=?").get(billId);
      if (!b) fail("Supplier bill not found.", 404);
      if (!["approved", "partially_paid"].includes(b.status)) fail("Approve the bill before recording a payment.", 409);
      const enriched = enrichBill(b);
      if (d.amountCents > enriched.balanceCents) fail("Payment exceeds remaining bill balance.", 409);
      const payId = randomUUID();
      db.prepare(
        "INSERT INTO _finance_bill_payments(id,bill_id,paid_on,amount_cents,method,reference,notes,created_by) VALUES(?,?,?,?,?,?,?,?)",
      ).run(payId, billId, d.paidOn, d.amountCents, d.method, d.reference, d.notes, user.id);
      const remaining = enriched.balanceCents - d.amountCents;
      const nextStatus = remaining === 0 ? "paid" : "partially_paid";
      db.prepare("UPDATE _finance_supplier_bills SET status=? WHERE id=?").run(nextStatus, billId);
      const bill = enrichBill(db.prepare("SELECT * FROM _finance_supplier_bills WHERE id=?").get(billId));
      const res = { bill, paymentId: payId };
      ack(d.requestKey, user, fp, res);
      return res;
    });
  }

  function applyCredit(user, billId, raw) {
    requireCap(user, "can_manage_liabilities", "apply supplier credit");
    parse(uuid, billId);
    const d = parse(creditInput, raw);
    const fp = hash({ action: "fin_credit_bill", billId, ...d });
    return transaction(db, () => {
      const prior = replay(user, d.requestKey, fp);
      if (prior) return prior;
      const b = db.prepare("SELECT * FROM _finance_supplier_bills WHERE id=?").get(billId);
      if (!b) fail("Supplier bill not found.", 404);
      if (b.status === "void" || b.status === "paid") fail("Cannot apply credit to a paid or void bill.", 409);
      const enriched = enrichBill(b);
      if (d.amountCents > enriched.balanceCents) fail("Credit exceeds remaining bill balance.", 409);
      const credId = randomUUID();
      db.prepare(
        "INSERT INTO _finance_bill_credits(id,bill_id,credited_on,amount_cents,reason,reference,created_by) VALUES(?,?,?,?,?,?,?)",
      ).run(credId, billId, d.creditedOn, d.amountCents, d.reason, d.reference, user.id);
      const remaining = enriched.balanceCents - d.amountCents;
      if (remaining === 0 && b.status !== "draft") {
        db.prepare("UPDATE _finance_supplier_bills SET status='paid' WHERE id=?").run(billId);
      }
      const bill = enrichBill(db.prepare("SELECT * FROM _finance_supplier_bills WHERE id=?").get(billId));
      const res = { bill, creditId: credId };
      ack(d.requestKey, user, fp, res);
      return res;
    });
  }

  function listPermissions(user) {
    if (!isAdmin(user)) fail("Owner or administrator access required to view finance permissions.", 403);
    return {
      rows: db
        .prepare("SELECT * FROM _finance_permissions ORDER BY updated_at DESC")
        .all()
        .map((r) => ({
          userId: r.user_id,
          canViewFinance: r.can_view_finance === 1,
          canManageReceivables: r.can_manage_receivables === 1,
          canManageLiabilities: r.can_manage_liabilities === 1,
          canApproveBills: r.can_approve_bills === 1,
          canReconcileAccounting: r.can_reconcile_accounting === 1,
          updatedBy: r.updated_by,
          updatedAt: r.updated_at,
        })),
    };
  }

  function setPermissions(user, raw) {
    if (!isAdmin(user)) fail("Owner or administrator access required to update finance permissions.", 403);
    const d = parse(permInput, raw);
    db.prepare(
      `INSERT INTO _finance_permissions(user_id,can_view_finance,can_manage_receivables,can_manage_liabilities,can_approve_bills,can_reconcile_accounting,updated_by,updated_at)
       VALUES(?,?,?,?,?,?,?,datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         can_view_finance=excluded.can_view_finance,
         can_manage_receivables=excluded.can_manage_receivables,
         can_manage_liabilities=excluded.can_manage_liabilities,
         can_approve_bills=excluded.can_approve_bills,
         can_reconcile_accounting=excluded.can_reconcile_accounting,
         updated_by=excluded.updated_by,
         updated_at=datetime('now')`,
    ).run(
      d.userId,
      Number(d.canViewFinance),
      Number(d.canManageReceivables),
      Number(d.canManageLiabilities),
      Number(d.canApproveBills),
      Number(d.canReconcileAccounting),
      user.id,
    );
    return listPermissions(user);
  }

  return {
    list,
    createBill,
    approveBill,
    recordPayment,
    applyCredit,
    listPermissions,
    setPermissions,
    hasCapability,
  };
}
