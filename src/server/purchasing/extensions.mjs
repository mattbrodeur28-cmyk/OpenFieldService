import { randomUUID } from "node:crypto";
import { z } from "zod";
import { migrate, transaction } from "../platform/sqlite.mjs";
import { admin, fail, parse } from "../inventory/domain.mjs";

const purchasingExtSchema = `
CREATE TABLE _purch_vendor_skus(
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES _purch_suppliers(id) ON DELETE RESTRICT,
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  vendor_sku TEXT NOT NULL,
  last_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(last_cost_cents>=0),
  lead_time_days INTEGER NOT NULL DEFAULT 0 CHECK(lead_time_days BETWEEN 0 AND 365),
  preferred INTEGER NOT NULL DEFAULT 0 CHECK(preferred IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(supplier_id,material_id)
);
CREATE TABLE _purch_vendor_credits(
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES _purch_orders(id) ON DELETE RESTRICT,
  supplier_id TEXT NOT NULL REFERENCES _purch_suppliers(id) ON DELETE RESTRICT,
  credit_number TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
  kind TEXT NOT NULL CHECK(kind IN ('return','price_credit','damaged_allowance')),
  status TEXT NOT NULL DEFAULT 'recorded' CHECK(status IN ('recorded','applied','void')),
  reason TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(supplier_id,credit_number)
);
`;

const uuid = z.string().uuid();
const skuInput = z.object({
    supplierId: uuid,
    materialId: uuid,
    vendorSku: z.string().trim().min(1).max(80),
    lastCostCents: z.number().int().nonnegative().max(100000000).default(0),
    leadTimeDays: z.number().int().min(0).max(365).default(0),
    preferred: z.boolean().default(false),
}).strict();

const creditInput = z.object({
    orderId: uuid,
    creditNumber: z.string().trim().min(1).max(80),
    amountCents: z.number().int().positive().max(1000000000),
    kind: z.enum(["return", "price_credit", "damaged_allowance"]).default("return"),
    reason: z.string().trim().min(5).max(2000),
}).strict();

export function createPurchasingExtensions({ storage }) {
    const db = storage.database;
    migrate(db, "_purchasing_ext_migrations", [{ version: 1, sql: purchasingExtSchema }]);

    const requireAdmin = (user) => {
        if (!admin(user)) fail("Owner or administrator Purchasing access required.", 403);
    };

    const listVendorSkus = (user, materialId = null) => {
        requireAdmin(user);
        const sql = `SELECT v.id,v.supplier_id AS supplierId,s.name AS supplierName,v.material_id AS materialId,
                            m.name AS materialName,v.vendor_sku AS vendorSku,v.last_cost_cents AS lastCostCents,
                            v.lead_time_days AS leadTimeDays,v.preferred
                     FROM _purch_vendor_skus v
                     JOIN _purch_suppliers s ON s.id=v.supplier_id
                     JOIN materials m ON m.id=v.material_id` + (materialId ? " WHERE v.material_id=?" : "") + " ORDER BY s.name,m.name";
        return (materialId ? db.prepare(sql).all(materialId) : db.prepare(sql).all()).map((r) => ({ ...r, preferred: r.preferred === 1 }));
    };

    function saveVendorSku(user, raw) {
        requireAdmin(user);
        const d = parse(skuInput, raw);
        return transaction(db, () => {
            if (!db.prepare("SELECT 1 FROM _purch_suppliers WHERE id=?").get(d.supplierId)) fail("Supplier not found.", 404);
            if (!db.prepare("SELECT 1 FROM materials WHERE id=?").get(d.materialId)) fail("Material not found.", 404);
            const id = randomUUID();
            db.prepare(
                `INSERT INTO _purch_vendor_skus(id,supplier_id,material_id,vendor_sku,last_cost_cents,lead_time_days,preferred)
                 VALUES(?,?,?,?,?,?,?)
                 ON CONFLICT(supplier_id,material_id) DO UPDATE SET vendor_sku=excluded.vendor_sku,last_cost_cents=excluded.last_cost_cents,
                 lead_time_days=excluded.lead_time_days,preferred=excluded.preferred,updated_at=CURRENT_TIMESTAMP`
            ).run(id, d.supplierId, d.materialId, d.vendorSku, d.lastCostCents, d.leadTimeDays, Number(d.preferred));
            return { sku: listVendorSkus(user, d.materialId).find((s) => s.supplierId === d.supplierId) };
        });
    }

    const listCredits = (user, orderId = null) => {
        requireAdmin(user);
        const sql = `SELECT c.id,c.order_id AS orderId,o.number AS orderNumber,c.supplier_id AS supplierId,
                            s.name AS supplierName,c.credit_number AS creditNumber,c.amount_cents AS amountCents,
                            c.kind,c.status,c.reason,c.actor_id AS actorId,c.created_at AS createdAt
                     FROM _purch_vendor_credits c
                     JOIN _purch_orders o ON o.id=c.order_id
                     JOIN _purch_suppliers s ON s.id=c.supplier_id` + (orderId ? " WHERE c.order_id=?" : "") + " ORDER BY c.created_at DESC";
        return (orderId ? db.prepare(sql).all(orderId) : db.prepare(sql).all()).map((r) => ({ ...r }));
    };

    function recordCredit(user, raw) {
        requireAdmin(user);
        const d = parse(creditInput, raw);
        return transaction(db, () => {
            const po = db.prepare("SELECT id,supplier_id FROM _purch_orders WHERE id=?").get(d.orderId);
            if (!po) fail("Purchase order not found.", 404);
            if (db.prepare("SELECT 1 FROM _purch_vendor_credits WHERE supplier_id=? AND credit_number=?").get(po.supplier_id, d.creditNumber))
                fail("That vendor credit number already exists for this supplier.", 409);
            const id = randomUUID();
            db.prepare(
                "INSERT INTO _purch_vendor_credits(id,order_id,supplier_id,credit_number,amount_cents,kind,status,reason,actor_id) VALUES(?,?,?,?,?,?,'recorded',?,?)"
            ).run(id, po.id, po.supplier_id, d.creditNumber, d.amountCents, d.kind, d.reason, user.id);
            return { credit: listCredits(user, po.id).find((c) => c.id === id) };
        });
    }

    // PURCH-005: Trace PO -> receipts -> stock movements -> job usage & vendor credits
    function reconciliation(user) {
        requireAdmin(user);
        const orders = db.prepare(
            `SELECT o.id,o.number,o.status,s.name AS supplierName,
                    COALESCE((SELECT ROUND(SUM(l.quantity_milli*l.unit_cost_cents)/1000.0) FROM _purch_lines l WHERE l.order_id=o.id),0) AS orderedCents,
                    COALESCE((SELECT ROUND(SUM(r.accepted_milli*r.unit_cost_cents)/1000.0) FROM _purch_receipts r WHERE r.order_id=o.id),0) AS receivedCents,
                    COALESCE((SELECT SUM(c.amount_cents) FROM _purch_vendor_credits c WHERE c.order_id=o.id AND c.status<>'void'),0) AS creditedCents
             FROM _purch_orders o JOIN _purch_suppliers s ON s.id=o.supplier_id ORDER BY o.created_at DESC LIMIT 200`
        ).all().map((r) => ({
            ...r,
            orderedCents: Math.round(r.orderedCents || 0),
            receivedCents: Math.round(r.receivedCents || 0),
            creditedCents: Math.round(r.creditedCents || 0),
            netReceivedCents: Math.max(0, Math.round(r.receivedCents || 0) - Math.round(r.creditedCents || 0)),
        }));
        return {
            computedAt: new Date().toISOString(),
            note: "Operational PO/receipt/credit reconciliation; operational receipt does not imply vendor bill, payment, or QuickBooks posting.",
            orders,
        };
    }

    return { listVendorSkus, saveVendorSku, listCredits, recordCredit, reconciliation };
}
