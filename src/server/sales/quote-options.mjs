import { createHash } from "node:crypto";
import { z } from "zod";
import { transaction } from "../platform/sqlite.mjs";
import { SalesError, parse, requireWriter, requireOwner } from "./domain.mjs";

const uuid = z.string().uuid();
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const optionItemInput = z.object({
    description: z.string().trim().min(1).max(300),
    quantityMilli: z.number().int().min(1).max(1000000000),
    unitPriceCents: z.number().int().nonnegative().max(1000000000),
    materialId: uuid.nullable().optional(),
}).strict();

const saveOptionInput = z.object({
    id: uuid,
    requestKey: uuid,
    expectedVersion: z.number().int().nonnegative().safe().default(0),
    label: z.string().trim().min(1).max(80),
    summary: z.string().trim().max(4000).default(""),
    recommended: z.boolean().default(false),
    position: z.number().int().nonnegative().default(0),
    taxCents: z.number().int().nonnegative().max(10000000000).default(0),
    items: z.array(optionItemInput).min(1).max(100),
}).strict();

const selectOptionInput = z.object({
    requestKey: uuid,
    selectedBy: z.string().trim().min(1).max(120),
}).strict();

export function createQuoteOptions({ storage, sales }) {
    const db = storage.database;

    const quoteHead = (quoteId) => {
        parse(uuid, quoteId);
        const row = db.prepare("SELECT * FROM _sales_quotes WHERE id=?").get(quoteId);
        if (!row) throw new SalesError("Quote not found.", 404);
        return row;
    };

    const replay = (user, key, fingerprint) => {
        const prior = db.prepare("SELECT actor_id,request_hash,response_json FROM _sales_quote_option_requests WHERE request_key=?").get(key);
        if (!prior) return null;
        if (prior.actor_id !== user.id) throw new SalesError("This request belongs to another account.", 403);
        if (prior.request_hash !== fingerprint) throw new SalesError("Request key has different quote option content.", 409);
        return JSON.parse(prior.response_json);
    };

    const ack = (key, user, fingerprint, result) =>
        db.prepare("INSERT INTO _sales_quote_option_requests(request_key,actor_id,request_hash,response_json) VALUES(?,?,?,?)").run(key, user.id, fingerprint, JSON.stringify(result));

    const shape = (r) => ({
        id: r.id,
        quoteId: r.quote_id,
        label: r.label,
        summary: r.summary,
        recommended: r.recommended === 1,
        position: r.position,
        items: JSON.parse(r.items_json),
        subtotalCents: r.subtotal_cents,
        taxCents: r.tax_cents,
        totalCents: r.total_cents,
        selected: r.selected === 1,
        selectedBy: r.selected_by,
        selectedAt: r.selected_at,
        version: r.version,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    });

    function list(user, quoteId) {
        requireWriter(user);
        return transaction(db, () => {
            const q = quoteHead(quoteId);
            requireOwner(user, sales.opportunity(q.opportunity_id));
            const rows = db.prepare("SELECT * FROM _sales_quote_options WHERE quote_id=? ORDER BY position,label,id").all(quoteId);
            return { quoteId, options: rows.map(shape) };
        });
    }

    function save(user, quoteId, raw) {
        requireWriter(user);
        const d = parse(saveOptionInput, raw);
        const fingerprint = hash({ action: "save_option", quoteId, ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint);
            if (prior) return prior;
            const q = quoteHead(quoteId);
            requireOwner(user, sales.opportunity(q.opportunity_id));
            const old = db.prepare("SELECT * FROM _sales_quote_options WHERE id=?").get(d.id);
            if (old && old.quote_id !== quoteId) throw new SalesError("Option does not belong to this quote.", 404);
            if (old && old.selected === 1) throw new SalesError("A customer-selected option is locked and cannot be overwritten.", 409);
            if (old && old.version !== d.expectedVersion) throw new SalesError("Quote option changed. Reload before saving.", 409);
            if (!old && d.expectedVersion !== 0) throw new SalesError("Quote option does not exist.", 409);

            const items = d.items.map((item) => ({
                ...item,
                lineTotalCents: Math.round((item.quantityMilli * item.unitPriceCents) / 1000),
            }));
            const subtotalCents = items.reduce((sum, i) => sum + i.lineTotalCents, 0);
            const totalCents = subtotalCents + d.taxCents;
            const version = (old?.version ?? 0) + 1;

            if (old) {
                db.prepare(
                    `UPDATE _sales_quote_options SET label=?,summary=?,recommended=?,position=?,items_json=?,
                     subtotal_cents=?,tax_cents=?,total_cents=?,version=?,updated_at=CURRENT_TIMESTAMP
                     WHERE id=? AND version=?`
                ).run(d.label, d.summary, Number(d.recommended), d.position, JSON.stringify(items), subtotalCents, d.taxCents, totalCents, version, d.id, d.expectedVersion);
            } else {
                db.prepare(
                    `INSERT INTO _sales_quote_options(id,quote_id,label,summary,recommended,position,items_json,subtotal_cents,tax_cents,total_cents,version)
                     VALUES(?,?,?,?,?,?,?,?,?,?,1)`
                ).run(d.id, quoteId, d.label, d.summary, Number(d.recommended), d.position, JSON.stringify(items), subtotalCents, d.taxCents, totalCents);
            }
            const saved = shape(db.prepare("SELECT * FROM _sales_quote_options WHERE id=?").get(d.id));
            const result = { option: saved };
            ack(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    function select(user, quoteId, optionId, raw) {
        requireWriter(user);
        parse(uuid, optionId);
        const d = parse(selectOptionInput, raw);
        const fingerprint = hash({ action: "select_option", quoteId, optionId, ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint);
            if (prior) return prior;
            const q = quoteHead(quoteId);
            requireOwner(user, sales.opportunity(q.opportunity_id));
            const opt = db.prepare("SELECT * FROM _sales_quote_options WHERE id=? AND quote_id=?").get(optionId, quoteId);
            if (!opt) throw new SalesError("Quote option not found.", 404);
            const alreadySelected = db.prepare("SELECT id,label FROM _sales_quote_options WHERE quote_id=? AND selected=1").get(quoteId);
            if (alreadySelected && alreadySelected.id !== optionId)
                throw new SalesError(`Option "${alreadySelected.label}" is already selected for this quote.`, 409);
            db.prepare("UPDATE _sales_quote_options SET selected=1,selected_by=?,selected_at=CURRENT_TIMESTAMP,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(d.selectedBy, optionId);
            const result = { option: shape(db.prepare("SELECT * FROM _sales_quote_options WHERE id=?").get(optionId)) };
            ack(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    function remove(user, quoteId, optionId) {
        requireWriter(user);
        parse(uuid, optionId);
        return transaction(db, () => {
            const q = quoteHead(quoteId);
            requireOwner(user, sales.opportunity(q.opportunity_id));
            const opt = db.prepare("SELECT * FROM _sales_quote_options WHERE id=? AND quote_id=?").get(optionId, quoteId);
            if (!opt) throw new SalesError("Quote option not found.", 404);
            if (opt.selected === 1) throw new SalesError("Cannot delete a selected quote option.", 409);
            db.prepare("DELETE FROM _sales_quote_options WHERE id=?").run(optionId);
            return { deleted: true };
        });
    }

    return { list, save, select, remove };
}
