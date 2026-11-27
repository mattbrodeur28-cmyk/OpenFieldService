import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "../platform/sqlite.mjs";
import { SalesError, parse, requireWriter, isSalesAdmin } from "./domain.mjs";

const uuid = z.string().uuid();
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const allocateInput = z.object({
    requestKey: uuid,
    targetPoId: uuid.nullable().optional(),
    supplierId: uuid.optional(),
    locationId: uuid.optional(),
    expectedDate: z.string().trim().max(20).optional(),
    notes: z.string().trim().max(2000).default(""),
    lines: z.array(z.object({
        lineKey: z.string().trim().min(1).max(120),
        quantityMilli: z.number().int().min(1).max(1000000000),
        unitCostCents: z.number().int().nonnegative().max(100000000).optional(),
    }).strict()).min(1).max(100),
    reason: z.string().trim().min(10).max(2000),
}).strict();

export function createQuoteProcurement({ storage, sales }) {
    const db = storage.database;

    const acceptedQuoteContext = (quoteId) => {
        parse(uuid, quoteId);
        const quote = db.prepare("SELECT * FROM _sales_quotes WHERE id=?").get(quoteId);
        if (!quote) throw new SalesError("Quote not found.", 404);
        // Find the latest accepted offer event for this quote
        const acceptedOffer = db.prepare(
            `SELECT o.id AS offerId,o.quote_version AS quoteVersion,r.pricing_json AS pricingJson
             FROM _sales_quote_offers o
             JOIN _sales_quote_lifecycle_events ev ON ev.offer_id=o.id AND ev.action='accepted'
             JOIN _sales_quote_revisions r ON r.quote_id=o.quote_id AND r.version=o.quote_version
             WHERE o.quote_id=? ORDER BY ev.sequence DESC LIMIT 1`
        ).get(quoteId);
        if (!acceptedOffer) return { quote, accepted: null, materialLines: [], jobId: null };

        const pricing = JSON.parse(acceptedOffer.pricingJson || "{}");
        const rawLines = pricing.lines || pricing.input?.lines || [];
        const materialLines = [];
        rawLines.forEach((line, idx) => {
            const cat = line.category || line.kind;
            const matId = line.materialId || line.material?.id || null;
            if (cat === "material" && matId) {
                const qty = line.quantityMilli ?? Math.round((Number(line.quantity) || 0) * 1000);
                const cost = line.unitCostCents ?? line.costUnitCents ?? line.costCents ?? 0;
                if (qty > 0) {
                    materialLines.push({
                        lineKey: String(line.id || `mat-${idx + 1}`),
                        materialId: matId,
                        description: line.description || line.name || "Material",
                        quotedMilli: qty,
                        unitCostCents: Math.max(0, Math.round(cost)),
                    });
                }
            }
        });
        let jobId = null;
        try {
            const conv = db.prepare("SELECT job_id FROM _sales_quote_conversions WHERE quote_id=? AND status='active' ORDER BY created_at DESC LIMIT 1").get(quoteId);
            jobId = conv?.job_id || null;
        } catch {
            jobId = null;
        }
        return { quote, accepted: acceptedOffer, materialLines, jobId };
    };

    function summary(user, quoteId) {
        requireWriter(user);
        return transaction(db, () => {
            const ctx = acceptedQuoteContext(quoteId);
            sales.opportunity(ctx.quote.opportunity_id);
            if (!ctx.accepted) {
                return { quoteId, accepted: false, quoteVersion: null, jobId: null, lines: [], allocations: [] };
            }
            const allocs = db.prepare(
                `SELECT p.*,o.number AS poNumber,o.status AS poStatus,
                        COALESCE((SELECT SUM(r.accepted_milli) FROM _purch_receipts r WHERE r.line_id=p.po_line_id),0) AS receivedMilli
                 FROM _sales_quote_procurement p
                 LEFT JOIN _purch_orders o ON o.id=p.po_id
                 WHERE p.quote_id=? AND p.quote_version=?
                 ORDER BY p.created_at DESC,p.id DESC`
            ).all(quoteId, ctx.accepted.quoteVersion);

            const orderedByKey = new Map();
            const receivedByKey = new Map();
            for (const a of allocs) {
                if (a.poStatus === "cancelled") continue;
                orderedByKey.set(a.line_key, (orderedByKey.get(a.line_key) || 0) + a.ordered_milli);
                receivedByKey.set(a.line_key, (receivedByKey.get(a.line_key) || 0) + (a.receivedMilli || 0));
            }
            const lines = ctx.materialLines.map((m) => {
                const orderedMilli = orderedByKey.get(m.lineKey) || 0;
                const receivedMilli = receivedByKey.get(m.lineKey) || 0;
                return {
                    ...m,
                    orderedMilli,
                    receivedMilli,
                    remainingMilli: Math.max(0, m.quotedMilli - orderedMilli),
                };
            });
            return {
                quoteId,
                accepted: true,
                quoteVersion: ctx.accepted.quoteVersion,
                jobId: ctx.jobId,
                lines,
                allocations: allocs.map((a) => ({
                    id: a.id, lineKey: a.line_key, materialId: a.material_id, description: a.description,
                    orderedMilli: a.ordered_milli, receivedMilli: a.receivedMilli || 0,
                    unitCostCents: a.unit_cost_cents, poId: a.po_id, poNumber: a.poNumber, poStatus: a.poStatus,
                    poLineId: a.po_line_id, jobId: a.job_id, actorId: a.actor_id, createdAt: a.created_at,
                })),
            };
        });
    }

    function allocate(user, quoteId, raw) {
        if (!isSalesAdmin(user)) throw new SalesError("Owner or Administrator access is required to create draft purchase orders from accepted quotes.", 403);
        const d = parse(allocateInput, raw);
        const fingerprint = hash({ action: "allocate_quote_po", quoteId, ...d });
        return transaction(db, () => {
            const prior = db.prepare("SELECT actor_id,request_hash,response_json FROM _sales_quote_procurement_requests WHERE request_key=?").get(d.requestKey);
            if (prior) {
                if (prior.actor_id !== user.id) throw new SalesError("This request belongs to another account.", 403);
                if (prior.request_hash !== fingerprint) throw new SalesError("Request key has different procurement content.", 409);
                return JSON.parse(prior.response_json);
            }

            const ctx = acceptedQuoteContext(quoteId);
            if (!ctx.accepted) throw new SalesError("Only an accepted quote version can be allocated to procurement.", 409);
            const matByKey = new Map(ctx.materialLines.map((m) => [m.lineKey, m]));

            // Compute already ordered per lineKey (excluding cancelled POs)
            const existingAllocs = db.prepare(
                `SELECT p.line_key,p.ordered_milli,o.status AS poStatus
                 FROM _sales_quote_procurement p LEFT JOIN _purch_orders o ON o.id=p.po_id
                 WHERE p.quote_id=? AND p.quote_version=?`
            ).all(quoteId, ctx.accepted.quoteVersion);
            const orderedByKey = new Map();
            for (const a of existingAllocs) {
                if (a.poStatus === "cancelled") continue;
                orderedByKey.set(a.line_key, (orderedByKey.get(a.line_key) || 0) + a.ordered_milli);
            }

            const seenKeys = new Set();
            const resolved = [];
            for (const item of d.lines) {
                if (seenKeys.has(item.lineKey)) throw new SalesError("Duplicate quote material line in procurement request.");
                seenKeys.add(item.lineKey);
                const m = matByKey.get(item.lineKey);
                if (!m) throw new SalesError(`Quote material line "${item.lineKey}" not found on accepted revision.`, 404);
                const already = orderedByKey.get(item.lineKey) || 0;
                const remaining = m.quotedMilli - already;
                if (item.quantityMilli > remaining) {
                    throw new SalesError(`Quantity for "${m.description}" exceeds remaining un-ordered quote demand (${item.quantityMilli} > ${remaining}).`, 409);
                }
                resolved.push({
                    lineKey: m.lineKey,
                    materialId: m.materialId,
                    description: m.description,
                    quantityMilli: item.quantityMilli,
                    unitCostCents: item.unitCostCents ?? m.unitCostCents,
                });
            }

            // Ensure Purchasing tables exist
            const hasPurch = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_purch_orders'").get();
            if (!hasPurch) throw new SalesError("Purchasing module is not initialized.", 501);

            let poId = d.targetPoId || null;
            let poNumber = "";
            let nextPosition = 1;
            if (poId) {
                const po = db.prepare("SELECT * FROM _purch_orders WHERE id=?").get(poId);
                if (!po) throw new SalesError("Target purchase order not found.", 404);
                if (po.status !== "draft") throw new SalesError("Only editable draft purchase orders can receive quote allocations; issued POs cannot be appended.", 409);
                poNumber = po.number;
                nextPosition = (db.prepare("SELECT COALESCE(MAX(position),0) AS p FROM _purch_lines WHERE order_id=?").get(poId).p || 0) + 1;
            } else {
                if (!d.supplierId || !d.locationId) throw new SalesError("Choose a supplier and ship-to location to create a new draft PO.");
                const sup = db.prepare("SELECT id,active,terms FROM _purch_suppliers WHERE id=?").get(d.supplierId);
                if (!sup || sup.active !== 1) throw new SalesError("Choose an active supplier.", 404);
                const loc = db.prepare("SELECT id,active FROM _inventory_locations WHERE id=?").get(d.locationId);
                if (!loc || loc.active !== 1) throw new SalesError("Choose an active ship-to location.", 404);
                const seq = db.prepare("SELECT next_number FROM _purch_sequences WHERE kind='po'").get();
                const num = seq?.next_number ?? 1;
                db.prepare("UPDATE _purch_sequences SET next_number=? WHERE kind='po'").run(num + 1);
                poId = randomUUID();
                poNumber = `PO-${String(num).padStart(6, "0")}`;
                db.prepare(
                    `INSERT INTO _purch_orders(id,number,supplier_id,location_id,status,currency,expected_date,terms,notes,tax_basis_points,freight_cents,version)
                     VALUES(?,?,?,?,'draft','USD',?,?,?,0,0,1)`
                ).run(poId, poNumber, d.supplierId, d.locationId, d.expectedDate || null, sup.terms || "", d.notes || `Allocated from accepted quote Q-${String(ctx.quote.number).padStart(6, "0")} r${ctx.accepted.quoteVersion}`);
            }

            const createdAllocations = [];
            for (const item of resolved) {
                const poLineId = randomUUID();
                db.prepare(
                    `INSERT INTO _purch_lines(id,order_id,material_id,job_id,description,quantity_milli,unit_cost_cents,position)
                     VALUES(?,?,?,?,?,?,?,?)`
                ).run(poLineId, poId, item.materialId, ctx.jobId, item.description, item.quantityMilli, item.unitCostCents, nextPosition++);
                const allocId = randomUUID();
                db.prepare(
                    `INSERT INTO _sales_quote_procurement(id,quote_id,quote_version,line_key,material_id,description,ordered_milli,unit_cost_cents,po_id,po_line_id,job_id,actor_id)
                     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
                ).run(allocId, quoteId, ctx.accepted.quoteVersion, item.lineKey, item.materialId, item.description, item.quantityMilli, item.unitCostCents, poId, poLineId, ctx.jobId, user.id);
                createdAllocations.push({ id: allocId, lineKey: item.lineKey, poId, poNumber, poLineId, quantityMilli: item.quantityMilli });
            }

            db.prepare(
                "INSERT INTO _purch_audit(actor_id,action,entity_id,before_json,after_json,reason) VALUES(?,?,?,?,?,?)"
            ).run(user.id, "quote_procurement_allocate", poId, "null", JSON.stringify({ quoteId, quoteVersion: ctx.accepted.quoteVersion, createdAllocations }), d.reason);

            const result = { poId, poNumber, status: "draft", allocations: createdAllocations };
            db.prepare("INSERT INTO _sales_quote_procurement_requests(request_key,actor_id,request_hash,response_json) VALUES(?,?,?,?)")
                .run(d.requestKey, user.id, fingerprint, JSON.stringify(result));
            return result;
        });
    }

    return { summary, allocate };
}
