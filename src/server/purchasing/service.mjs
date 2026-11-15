import { randomUUID, createHash } from "node:crypto";
import { migrate, transaction } from "../platform/sqlite.mjs";
import { admin, fail, parse } from "../inventory/domain.mjs";
import { purchasingSchema } from "./schema.mjs";
import {
  supplierInput,
  orderInput,
  actionInput,
  receiptInput,
  totals,
} from "./domain.mjs";
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createPurchasing({ storage, inventory }) {
  const db = storage.database;
  migrate(db, "_purchasing_migrations", [
    { version: 1, sql: purchasingSchema },
  ]);
  const requireAdmin = (user) => {
    if (!admin(user))
      fail("Owner or administrator Purchasing access required.", 403);
  };
  const supplier = (id) => {
    const row = db.prepare("SELECT * FROM _purch_suppliers WHERE id=?").get(id);
    if (!row) fail("Supplier not found.", 404);
    return row;
  };
  const order = (id) => {
    const row = db.prepare("SELECT * FROM _purch_orders WHERE id=?").get(id);
    if (!row) fail("Purchase order not found.", 404);
    return row;
  };
  const audit = (user, action, id, before, after, reason) =>
    db
      .prepare(
        "INSERT INTO _purch_audit(actor_id,action,entity_id,before_json,after_json,reason) VALUES(?,?,?,?,?,?)",
      )
      .run(
        user.id,
        action,
        id,
        JSON.stringify(before ?? null),
        JSON.stringify(after),
        reason,
      );
  function command(user, kind, raw, schema, work) {
    requireAdmin(user);
    const data = parse(schema, raw),
      fingerprint = hash({ actor: user.id, kind, data });
    return transaction(db, () => {
      const previous = db
        .prepare("SELECT * FROM _purch_requests WHERE request_key=?")
        .get(data.requestKey);
      if (previous) {
        if (previous.actor_id !== user.id)
          fail("This purchase request belongs to another actor.", 403);
        if (previous.request_hash !== fingerprint)
          fail(
            "This request key was already used for different purchasing data.",
            409,
          );
        return { ...JSON.parse(previous.response_json), replayed: true };
      }
      const result = work(data);
      db.prepare(
        "INSERT INTO _purch_requests(request_key,actor_id,request_hash,response_json) VALUES(?,?,?,?)",
      ).run(data.requestKey, user.id, fingerprint, JSON.stringify(result));
      return { ...result, replayed: false };
    });
  }
  function lines(id) {
    return db
      .prepare(
        "SELECT l.*,m.name AS material_name,m.unit,j.identifier AS job_identifier,(SELECT COALESCE(SUM(r.accepted_milli),0) FROM _purch_receipts r WHERE r.line_id=l.id) AS received_milli FROM _purch_lines l JOIN materials m ON m.id=l.material_id LEFT JOIN jobs j ON j.id=l.job_id WHERE l.order_id=? ORDER BY l.position,l.id",
      )
      .all(id);
  }
  function source(po) {
    const destination = db
      .prepare(
        "SELECT id,name,code,kind,technician_id,active,version FROM _inventory_locations WHERE id=?",
      )
      .get(po.location_id);
    return {
      number: po.number,
      currency: po.currency,
      expectedDate: po.expected_date,
      terms: po.terms,
      notes: po.notes,
      taxBasisPoints: po.tax_basis_points,
      freightCents: po.freight_cents,
      supplier: supplier(po.supplier_id),
      destination,
      lines: lines(po.id).map(({ received_milli, ...line }) => line),
    };
  }
  function validateSource(po) {
    const snapshot = source(po);
    if (!snapshot.supplier.active)
      fail("Choose an active supplier before approval or issue.", 409);
    if (!snapshot.destination?.active)
      fail("Choose an active ship-to stock location.", 409);
    if (!snapshot.lines.length)
      fail("Add purchase lines before approval.", 409);
    totals(snapshot.lines, po.tax_basis_points, po.freight_cents);
    return snapshot;
  }
  function options(user) {
    requireAdmin(user);
    const suppliers = db
      .prepare("SELECT * FROM _purch_suppliers ORDER BY name,id LIMIT 501")
      .all();
    const materials = db
      .prepare(
        "SELECT id,name,unit,unit_cost,in_stock FROM materials ORDER BY name,id LIMIT 1001",
      )
      .all();
    const jobs = db
      .prepare(
        "SELECT id,identifier FROM jobs ORDER BY created_at DESC,id LIMIT 1001",
      )
      .all();
    if (suppliers.length > 500 || materials.length > 1000 || jobs.length > 1000)
      fail(
        "Purchasing choices require a paginated search for this company scope.",
        422,
      );
    return {
      suppliers,
      materials,
      jobs,
      locations: inventory.optionsInTransaction(user).locations,
    };
  }
  function list(user, { page = 1, status = "all", search = "" } = {}) {
    requireAdmin(user);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 100000 ||
      typeof search !== "string" ||
      search.length > 120 ||
      ![
        "all",
        "draft",
        "approved",
        "issued",
        "partially_received",
        "received",
        "closed",
        "cancelled",
      ].includes(status)
    )
      fail("Choose valid purchase filters.");
    const needle =
      "%" +
      search.replaceAll("!", "!!").replaceAll("%", "!%").replaceAll("_", "!_") +
      "%";
    const rows = db
      .prepare(
        "SELECT o.*,s.name AS supplier_name,l.name AS location_name FROM _purch_orders o JOIN _purch_suppliers s ON s.id=o.supplier_id JOIN _inventory_locations l ON l.id=o.location_id WHERE (?='all' OR o.status=?) AND (o.number LIKE ? ESCAPE '!' OR s.name LIKE ? ESCAPE '!') ORDER BY o.created_at DESC,o.rowid DESC LIMIT 51 OFFSET ?",
      )
      .all(status, status, needle, needle, (page - 1) * 50);
    return {
      orders: rows.slice(0, 50).map((po) => ({
        ...po,
        ...totals(lines(po.id), po.tax_basis_points, po.freight_cents),
      })),
      page,
      hasMore: rows.length > 50,
    };
  }
  function costs(po, currentLines) {
    const open = [
      "approved",
      "issued",
      "partially_received",
      "received",
    ].includes(po.status)
      ? currentLines.map((line) => ({
          quantity_milli: Math.max(
            0,
            line.quantity_milli - line.received_milli,
          ),
          unit_cost_cents: line.unit_cost_cents,
        }))
      : [];
    const accepted = db
      .prepare(
        "SELECT accepted_milli,unit_cost_cents FROM _purch_receipts WHERE order_id=?",
      )
      .all(po.id)
      .reduce(
        (sum, row) =>
          sum + BigInt(row.accepted_milli) * BigInt(row.unit_cost_cents),
        0n,
      );
    return {
      openMaterialCents: totals(open, 0, 0).subtotalCents,
      acceptedMaterialCents: Number((accepted + 500n) / 1000n),
      acceptedValueMillicents: accepted.toString(),
    };
  }
  function detail(user, id, page = 1) {
    requireAdmin(user);
    const po = order(id),
      currentLines = lines(id),
      snapshot = po.current_issue_id
        ? db
            .prepare("SELECT * FROM _purch_issues WHERE id=?")
            .get(po.current_issue_id)
        : null;
    if (!Number.isInteger(page) || page < 1 || page > 100000)
      fail("Choose a valid receipt history page.");
    const issued = snapshot
      ? { ...snapshot, snapshot: JSON.parse(snapshot.snapshot_json) }
      : null;
    const shown = currentLines.map((line) => {
      const frozen = issued?.snapshot.lines.find((row) => row.id === line.id);
      return {
        ...line,
        material_name: frozen?.material_name || line.material_name,
        unit: frozen?.unit || line.unit,
        remaining_milli: Math.max(0, line.quantity_milli - line.received_milli),
      };
    });
    const receipts = db
      .prepare(
        "SELECT r.*,m.kind AS movement_kind FROM _purch_receipts r LEFT JOIN _inventory_movements m ON m.id=r.movement_id WHERE r.order_id=? ORDER BY r.created_at DESC,r.rowid DESC LIMIT 101 OFFSET ?",
      )
      .all(id, (page - 1) * 100);
    const destination = db
      .prepare("SELECT * FROM _inventory_locations WHERE id=?")
      .get(po.location_id);
    return {
      order: po,
      supplier: supplier(po.supplier_id),
      destination,
      lines: shown,
      issued,
      totals: {
        ...totals(currentLines, po.tax_basis_points, po.freight_cents),
        ...costs(po, currentLines),
      },
      receipts: receipts.slice(0, 100),
      receiptPage: page,
      hasMoreReceipts: receipts.length > 100,
    };
  }
  function saveSupplier(user, raw) {
    return command(user, "supplier", raw, supplierInput, (d) => {
      const before =
        db.prepare("SELECT * FROM _purch_suppliers WHERE id=?").get(d.id) ||
        null;
      if ((before?.version || 0) !== d.expectedVersion)
        fail("Supplier changed. Reload before saving.", 409);
      if (
        db
          .prepare(
            "SELECT 1 FROM _purch_suppliers WHERE code=? COLLATE NOCASE AND id<>?",
          )
          .get(d.code, d.id)
      )
        fail("Supplier code is already in use.", 409);
      if (before)
        db.prepare(
          "UPDATE _purch_suppliers SET code=?,name=?,contact_name=?,email=?,phone=?,address=?,terms=?,active=?,version=version+1 WHERE id=?",
        ).run(
          d.code,
          d.name,
          d.contactName,
          d.email,
          d.phone,
          d.address,
          d.terms,
          Number(d.active),
          d.id,
        );
      else
        db.prepare(
          "INSERT INTO _purch_suppliers(id,code,name,contact_name,email,phone,address,terms,active) VALUES(?,?,?,?,?,?,?,?,?)",
        ).run(
          d.id,
          d.code,
          d.name,
          d.contactName,
          d.email,
          d.phone,
          d.address,
          d.terms,
          Number(d.active),
        );
      const after = supplier(d.id);
      audit(user, "supplier_saved", d.id, before, after, d.reason);
      return { id: d.id, version: after.version };
    });
  }
  function saveOrder(user, raw) {
    return command(user, "order", raw, orderInput, (d) => {
      const before =
        db.prepare("SELECT * FROM _purch_orders WHERE id=?").get(d.id) || null;
      if ((before?.version || 0) !== d.expectedVersion)
        fail("Purchase order changed. Reload before saving.", 409);
      if (before && before.status !== "draft")
        fail("Only a draft purchase order can be edited.", 409);
      if (!supplier(d.supplierId).active) fail("Choose an active supplier.");
      if (
        !db
          .prepare("SELECT 1 FROM _inventory_locations WHERE id=? AND active=1")
          .get(d.locationId)
      )
        fail("Choose an active ship-to stock location.");
      for (const line of d.lines) {
        if (
          !db.prepare("SELECT 1 FROM materials WHERE id=?").get(line.materialId)
        )
          fail("Purchase material not found.", 404);
        if (
          line.jobId &&
          !db.prepare("SELECT 1 FROM jobs WHERE id=?").get(line.jobId)
        )
          fail("Linked job not found.", 404);
        if (
          db
            .prepare(
              "SELECT order_id FROM _purch_lines WHERE id=? AND order_id<>?",
            )
            .get(line.id, d.id)
        )
          fail("A purchase line belongs to another order.", 409);
      }
      totals(d.lines, d.taxBasisPoints, d.freightCents);
      let number = before?.number;
      if (!before) {
        const seq = db
          .prepare("SELECT next_number FROM _purch_sequences WHERE kind='po'")
          .get().next_number;
        if (seq > 999999999)
          fail(
            "Purchase order number sequence requires administrator review.",
            422,
          );
        number = "PO-" + String(seq).padStart(6, "0");
        db.prepare(
          "UPDATE _purch_sequences SET next_number=next_number+1 WHERE kind='po'",
        ).run();
        db.prepare(
          "INSERT INTO _purch_orders(id,number,supplier_id,location_id,status,currency,expected_date,terms,notes,tax_basis_points,freight_cents) VALUES(?,?,?,?,'draft','USD',?,?,?,?,?)",
        ).run(
          d.id,
          number,
          d.supplierId,
          d.locationId,
          d.expectedDate,
          d.terms,
          d.notes,
          d.taxBasisPoints,
          d.freightCents,
        );
      } else
        db.prepare(
          "UPDATE _purch_orders SET supplier_id=?,location_id=?,expected_date=?,terms=?,notes=?,tax_basis_points=?,freight_cents=?,version=version+1 WHERE id=?",
        ).run(
          d.supplierId,
          d.locationId,
          d.expectedDate,
          d.terms,
          d.notes,
          d.taxBasisPoints,
          d.freightCents,
          d.id,
        );
      const oldLines = before ? lines(d.id) : [];
      db.prepare("DELETE FROM _purch_lines WHERE order_id=?").run(d.id);
      d.lines.forEach((line, i) =>
        db
          .prepare(
            "INSERT INTO _purch_lines(id,order_id,material_id,job_id,description,quantity_milli,unit_cost_cents,position) VALUES(?,?,?,?,?,?,?,?)",
          )
          .run(
            line.id,
            d.id,
            line.materialId,
            line.jobId,
            line.description,
            line.quantityMilli,
            line.unitCostCents,
            i,
          ),
      );
      audit(
        user,
        "order_saved",
        d.id,
        before ? { order: before, lines: oldLines } : null,
        { order: order(d.id), lines: lines(d.id) },
        d.reason,
      );
      return { id: d.id, number, version: order(d.id).version };
    });
  }
  function action(user, raw) {
    return command(user, "action", raw, actionInput, (d) => {
      const before = order(d.orderId);
      if (before.version !== d.expectedVersion)
        fail("Purchase order changed. Reload before continuing.", 409);
      let state,
        approvalHash = before.approval_hash,
        issueId = before.current_issue_id;
      if (d.action === "approve") {
        if (before.status !== "draft")
          fail("Only drafts can be approved.", 409);
        const snapshot = validateSource(before);
        approvalHash = hash(snapshot);
        state = "approved";
        audit(user, "approval_snapshot", before.id, null, snapshot, d.reason);
      }
      if (d.action === "issue") {
        if (before.status !== "approved")
          fail("Approve the current order before issuing it.", 409);
        const snapshot = validateSource(before);
        if (hash(snapshot) !== before.approval_hash)
          fail(
            "Supplier, destination or material details changed since approval. Return the order to draft and review it again.",
            409,
          );
        issueId = randomUUID();
        const revision =
          (db
            .prepare(
              "SELECT MAX(revision) AS n FROM _purch_issues WHERE order_id=?",
            )
            .get(before.id).n || 0) + 1;
        db.prepare(
          "INSERT INTO _purch_issues(id,order_id,revision,actor_id,snapshot_json) VALUES(?,?,?,?,?)",
        ).run(issueId, before.id, revision, user.id, JSON.stringify(snapshot));
        state = "issued";
      }
      if (d.action === "return_to_draft") {
        if (before.status !== "approved")
          fail("Only an unissued approved order can return to draft.", 409);
        state = "draft";
        approvalHash = null;
      }
      if (d.action === "cancel") {
        if (
          !["draft", "approved", "issued"].includes(before.status) ||
          db
            .prepare(
              "SELECT 1 FROM _purch_receipts WHERE order_id=? AND accepted_milli>0",
            )
            .get(before.id)
        )
          fail(
            "Received orders cannot be cancelled. Close outstanding commitments with a reason.",
            409,
          );
        state = "cancelled";
      }
      if (d.action === "close") {
        if (
          !["issued", "partially_received", "received"].includes(before.status)
        )
          fail("Only issued orders can close.", 409);
        state = "closed";
      }
      db.prepare(
        "UPDATE _purch_orders SET status=?,approval_hash=?,current_issue_id=?,version=version+1 WHERE id=?",
      ).run(state, approvalHash, issueId, before.id);
      audit(user, d.action, before.id, before, order(before.id), d.reason);
      return { id: before.id, status: state, version: before.version + 1 };
    });
  }
  function receive(user, raw) {
    return command(user, "receive", raw, receiptInput, (d) => {
      const before = order(d.orderId);
      if (before.version !== d.expectedVersion)
        fail(
          "Purchase order changed. Reload quantities before receiving.",
          409,
        );
      if (
        !["issued", "partially_received", "received"].includes(before.status) ||
        !before.current_issue_id
      )
        fail("Receive against an issued open purchase order.", 409);
      const line = lines(before.id).find((l) => l.id === d.lineId);
      if (!line) fail("Purchase line not found on this order.", 404);
      const issued = JSON.parse(
        db
          .prepare("SELECT snapshot_json FROM _purch_issues WHERE id=?")
          .get(before.current_issue_id).snapshot_json,
      );
      const frozen = issued.lines.find((row) => row.id === line.id);
      if (
        !frozen ||
        frozen.material_id !== line.material_id ||
        frozen.unit !== line.unit
      )
        fail(
          "The material unit changed after issue. Review the original PO before receiving; quantities cannot be converted silently.",
          409,
        );
      const remaining = Math.max(0, line.quantity_milli - line.received_milli),
        over = d.acceptedMilli > remaining;
      if (over && (!d.approveOverReceipt || d.overReceiptReason.length < 10))
        fail(
          "Over-receipt requires explicit administrator approval and a reason.",
          409,
        );
      if (
        d.unitCostCents !== line.unit_cost_cents &&
        d.acceptedMilli > 0 &&
        d.priceVarianceReason.length < 10
      )
        fail("Explain the actual receipt price variance before posting.", 409);
      if (BigInt(d.acceptedMilli) * BigInt(d.unitCostCents) > 10000000000000n)
        fail(
          "This receipt exceeds the supported $100 million review limit.",
          422,
        );
      const acceptedBefore = BigInt(
        costs(before, lines(before.id)).acceptedValueMillicents,
      );
      if (
        acceptedBefore + BigInt(d.acceptedMilli) * BigInt(d.unitCostCents) >
        10000000000000n
      )
        fail(
          "Accepted material on this PO exceeds the supported $100 million review limit.",
          422,
        );
      const stock = db
        .prepare(
          "SELECT version FROM _inventory_balances WHERE location_id=? AND material_id=?",
        )
        .get(before.location_id, line.material_id);
      const location = db
        .prepare("SELECT active FROM _inventory_locations WHERE id=?")
        .get(before.location_id);
      if (!location?.active)
        fail(
          "The issued ship-to stock location is inactive. Review the destination before receiving.",
          409,
        );
      if ((stock?.version || 0) !== d.expectedStockVersion)
        fail("Ship-to stock changed. Reload before receiving.", 409);
      let movementId = null;
      if (d.acceptedMilli) {
        const movement = inventory.postInTransaction(user, "receipt", {
          requestKey: randomUUID(),
          materialId: line.material_id,
          locationId: before.location_id,
          quantityMilli: d.acceptedMilli,
          unitCostCents: d.unitCostCents,
          expectedVersion: d.expectedStockVersion,
          opening: false,
          reason: `${before.number}: ${d.reason}`.slice(0, 1000),
        });
        movementId = movement.movementId;
      }
      const receiptId = randomUUID();
      db.prepare(
        "INSERT INTO _purch_receipts(id,actor_id,order_id,line_id,issue_id,movement_id,delivered_milli,accepted_milli,rejected_milli,unit_cost_cents,packing_slip,reason,price_variance_reason,over_receipt_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ).run(
        receiptId,
        user.id,
        before.id,
        line.id,
        before.current_issue_id,
        movementId,
        d.deliveredMilli,
        d.acceptedMilli,
        d.rejectedMilli,
        d.unitCostCents,
        d.packingSlip,
        d.reason,
        d.priceVarianceReason,
        over ? d.overReceiptReason : "",
      );
      const current = lines(before.id),
        any = current.some((l) => l.received_milli > 0),
        all = current.every((l) => l.received_milli >= l.quantity_milli),
        state = all ? "received" : any ? "partially_received" : "issued";
      db.prepare(
        "UPDATE _purch_orders SET status=?,version=version+1 WHERE id=?",
      ).run(state, before.id);
      audit(
        user,
        "received",
        before.id,
        { order: before, line },
        {
          order: order(before.id),
          receiptId,
          movementId,
          acceptedMilli: d.acceptedMilli,
          rejectedMilli: d.rejectedMilli,
        },
        d.reason,
      );
      return {
        id: before.id,
        receiptId,
        movementId,
        status: state,
        version: before.version + 1,
      };
    });
  }
  return {
    options: (user) => transaction(db, () => options(user)),
    list: (user, filters) => transaction(db, () => list(user, filters)),
    detail: (user, id, page) => transaction(db, () => detail(user, id, page)),
    stockReferencesInTransaction(user, movementIds) {
      requireAdmin(user);
      if (!movementIds.length) return [];
      if (movementIds.length > 100)
        fail("Choose at most 100 stock references.");
      return db
        .prepare(
          `SELECT r.movement_id,r.order_id,o.number FROM _purch_receipts r JOIN _purch_orders o ON o.id=r.order_id WHERE r.movement_id IN (${movementIds.map(() => "?").join(",")})`,
        )
        .all(...movementIds);
    },
    saveSupplier,
    saveOrder,
    action,
    receive,
  };
}
