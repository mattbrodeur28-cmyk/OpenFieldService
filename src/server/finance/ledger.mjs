// Combined money-in / money-out ledger.
export function createLedger({ storage }) {
    const db = storage.database;
    const has = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
    function list(user, query = {}) {
        const kind = query.kind === "in" || query.kind === "out" ? query.kind : "all";
        const page = Math.max(1, Math.min(1000000, Number(query.page) || 1));
        const entries = [];
        if (has("_finance_invoice_payments")) {
            const rows = db.prepare(`SELECT p.id, p.paid_on AS occurredOn, i.identifier AS reference, COALESCE(c.name,'Customer') AS party, p.amount_cents AS amountCents, p.method AS method, p.reference AS memo FROM _finance_invoice_payments p JOIN invoices i ON i.id=p.invoice_id LEFT JOIN jobs j ON j.id=i.job_id LEFT JOIN customers c ON c.id=j.customer_id WHERE NOT EXISTS (SELECT 1 FROM _finance_payment_reversals r WHERE r.payment_id=p.id)`).all();
            for (const r of rows) entries.push({ direction: "in", ...r });
        }
        if (has("_purch_receipts") && has("_purch_orders") && has("_purch_suppliers")) {
            const rows = db.prepare(`SELECT r.id, substr(r.created_at,1,10) AS occurredOn, o.number AS reference, s.name AS party, CAST(round(r.accepted_milli * r.unit_cost_cents / 1000.0) AS INTEGER) AS amountCents, 'purchase' AS method, 'Purchase receipt' AS memo FROM _purch_receipts r JOIN _purch_orders o ON o.id=r.order_id JOIN _purch_suppliers s ON s.id=o.supplier_id`).all();
            for (const r of rows) entries.push({ direction: "out", ...r });
        }
        entries.sort((a, b) => (String(b.occurredOn) + b.id).localeCompare(String(a.occurredOn) + a.id));
        const totalInCents = entries.reduce((n, e) => e.direction === "in" ? n + e.amountCents : n, 0);
        const totalOutCents = entries.reduce((n, e) => e.direction === "out" ? n + e.amountCents : n, 0);
        const filtered = kind === "all" ? entries : entries.filter((e) => e.direction === kind);
        return { entries: filtered.slice((page - 1) * 50, page * 50), totalInCents, totalOutCents, netCents: totalInCents - totalOutCents, total: filtered.length, page, pageSize: 50, kind };
    }
    return { list };
}
