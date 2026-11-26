import { z } from 'zod';
import { createHash } from 'node:crypto';
import { transaction } from '../platform/sqlite.mjs';
import { ServiceIdentityError } from '../service/identity.mjs';
const fail = (message, status = 400) => { throw new ServiceIdentityError(message, status); };
const uuid = z.string().uuid(), page = z.coerce.number().int().min(1).max(1000000);
const date = z.string().refine(v => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Choose a valid calendar date.');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const queryInput = z.object({ page: page.default(1), search: z.string().trim().max(200).default(''), state: z.enum(['open', 'all', 'review']).default('open'), bucket: z.enum(['all', 'current', '1_30', '31_60', '61_90', 'over_90', 'undated', 'review']).default('all'), customerId: uuid.optional() }).strict();
const noteInput = z.object({ id: uuid, requestKey: uuid, sourceToken: z.string().regex(/^[0-9a-f]{64}$/), content: z.string().trim().min(10).max(4000), followUpOn: z.union([z.literal(''), date]) }).strict();
function parse(schema, input) { const r = schema.safeParse(input); if (!r.success)
    fail(r.error.issues.map(i => i.message).join('; ')); return r.data; }
const buckets = ['current', '1_30', '31_60', '61_90', 'over_90', 'undated', 'review'];
/** Live projections over native invoices and the existing immutable receipt ledger. */
export function createReceivables({ storage, admin, today, command }) {
    const db = storage.database;
    function projection(companyDate) {
        // Native legacy totals are usable only if they already represent exact cents.
        // Invalid amounts and paid-without-evidence stay unresolved, never zeroed.
        return { sql: `WITH receipts AS (
   SELECT p.invoice_id,COUNT(*) AS receipt_count,
    SUM(CASE WHEN r.id IS NULL THEN p.amount_cents ELSE 0 END) AS paid_cents
   FROM _finance_invoice_payments p LEFT JOIN _finance_payment_reversals r ON r.payment_id=p.id GROUP BY p.invoice_id
  ), sources AS (
   SELECT i.id,i.identifier,i.status,i.customer_id,c.name AS customer_name,
    i.job_id,j.identifier AS job_identifier,i.due_date,refs.customer_po,
    CASE WHEN typeof(i.total) IN('real','integer') AND i.total>=0 AND i.total<=100000000 AND round(i.total,2)=i.total THEN CAST(round(i.total*100) AS INTEGER) ELSE NULL END AS total_cents,
    COALESCE(p.paid_cents,0) AS paid_cents,COALESCE(p.receipt_count,0) AS receipt_count,
    COALESCE(cr.total_cents,0) AS credited_cents,(SELECT COUNT(*) FROM _finance_invoice_credits ch WHERE ch.invoice_id=i.id) AS credit_count,
    CASE WHEN length(i.due_date)=10 AND date(i.due_date,'+0 days')=i.due_date THEN CAST(julianday(?) - julianday(i.due_date) AS INTEGER) ELSE NULL END AS days_past_due
   FROM invoices i JOIN customers c ON c.id=i.customer_id LEFT JOIN jobs j ON j.id=i.job_id
   LEFT JOIN _finance_job_references refs ON refs.job_id=i.job_id LEFT JOIN receipts p ON p.invoice_id=i.id LEFT JOIN _finance_active_credits cr ON cr.invoice_id=i.id
   WHERE i.status IN('sent','overdue','paid')
  ), balances AS (
   SELECT *,CASE WHEN total_cents IS NULL OR paid_cents+credited_cents>total_cents OR (status='paid' AND ((receipt_count=0 AND credit_count=0) OR paid_cents+credited_cents<>total_cents)) THEN NULL ELSE total_cents-paid_cents-credited_cents END AS balance_cents FROM sources
  ), receivables AS (
   SELECT *,CASE WHEN balance_cents IS NULL THEN 'review' WHEN days_past_due IS NULL THEN 'undated' WHEN days_past_due<=0 THEN 'current' WHEN days_past_due<=30 THEN '1_30' WHEN days_past_due<=60 THEN '31_60' WHEN days_past_due<=90 THEN '61_90' ELSE 'over_90' END AS aging_bucket FROM balances
  )`, args: [companyDate] };
    }
    function list(user, raw = {}) {
        admin(user);
        const q = parse(queryInput, raw);
        return transaction(db, () => {
            const companyDate = today(), base = projection(companyDate), where = ["instr(lower(identifier||' '||customer_name||' '||COALESCE(job_identifier,'')||' '||COALESCE(customer_po,'')),lower(?))>0"], args = [...base.args, q.search];
            if (q.customerId) {
                where.push('customer_id=?');
                args.push(q.customerId);
            }
            if (q.state === 'open')
                where.push('(balance_cents>0 OR balance_cents IS NULL)');
            if (q.state === 'review')
                where.push('balance_cents IS NULL');
            // Summary follows search/customer/state, across all pages. Bucket narrows rows
            // only, so clicking an aging bucket does not erase the other summary amounts.
            const summary = db.prepare(base.sql + ' SELECT aging_bucket AS bucket,COUNT(*) AS count,SUM(COALESCE(balance_cents,0)) AS amount_cents FROM receivables WHERE ' + where.join(' AND ') + ' GROUP BY aging_bucket').all(...args);
            for (const row of summary)
                if (!Number.isSafeInteger(row.amount_cents))
                    fail('Receivables summary exceeds exact-number limits; use an accounting export.', 422);
            const rowWhere = [...where], rowArgs = [...args];
            if (q.bucket !== 'all') {
                rowWhere.push('aging_bucket=?');
                rowArgs.push(q.bucket);
            }
            const total = db.prepare(base.sql + ' SELECT COUNT(*) AS n FROM receivables WHERE ' + rowWhere.join(' AND ')).get(...rowArgs).n;
            const rows = db.prepare(base.sql + ' SELECT * FROM receivables WHERE ' + rowWhere.join(' AND ') + " ORDER BY CASE WHEN balance_cents IS NULL THEN 0 ELSE 1 END,CASE WHEN days_past_due IS NULL THEN 1 ELSE 0 END,days_past_due DESC,identifier,id LIMIT 25 OFFSET ?").all(...rowArgs, (q.page - 1) * 25);
            const knownBalanceCents = summary.reduce((n, row) => n + row.amount_cents, 0);
            if (!Number.isSafeInteger(knownBalanceCents))
                fail('Receivables total exceeds exact-number limits.', 422);
            return { companyDate, currency: 'USD', summary: buckets.map(bucket => { const row = summary.find(r => r.bucket === bucket); return { bucket, count: row?.count ?? 0, amountCents: bucket === 'review' ? null : row?.amount_cents ?? 0 }; }), knownBalanceCents, unresolvedCount: summary.find(r => r.bucket === 'review')?.count ?? 0, rows, total, page: q.page, pageSize: 25 };
        });
    }
    // Caller-owned customer read transaction; names/records are never copied.
    function customerSummaryInTransaction(customerId) {
        parse(uuid,customerId);
        const base=projection(today());
        const row=db.prepare(base.sql+` SELECT COUNT(*) AS issued_count,
          SUM(CASE WHEN total_cents IS NULL THEN 1 ELSE 0 END) AS invalid_count,
          SUM(CASE WHEN balance_cents IS NULL THEN 1 ELSE 0 END) AS unresolved_count,
          COALESCE(SUM(COALESCE(total_cents,0)-credited_cents),0) AS net_billed,
          COALESCE(SUM(COALESCE(balance_cents,0)),0) AS known_outstanding,
          COALESCE(SUM(paid_cents),0) AS receipts,COALESCE(SUM(credited_cents),0) AS credits
          FROM receivables WHERE customer_id=?`).get(...base.args,customerId);
        for(const key of ['net_billed','known_outstanding','receipts','credits'])if(!Number.isSafeInteger(row[key]))fail('Customer financial summary exceeds exact-number limits.',422);
        const count=db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE customer_id=?').get(customerId).n;
        return {count,billed:row.invalid_count?null:row.net_billed/100,outstanding:row.unresolved_count?null:row.known_outstanding/100,knownOutstanding:row.known_outstanding/100,unresolvedCount:row.unresolved_count??0,recordedReceipts:row.receipts/100,credits:row.credits/100,currency:'USD',basis:'native_finance_ledger'};
    }
    const customerSummary=customerId=>transaction(db,()=>customerSummaryInTransaction(customerId));
    function context(id) { parse(uuid, id); const row = db.prepare('SELECT id,identifier,status,customer_id,job_id,total,due_date FROM invoices WHERE id=?').get(id); if (!row)
        fail('Invoice not found.', 404); if (!['sent', 'overdue', 'paid'].includes(row.status))
        fail('Collections notes apply to issued invoices.', 409); return row; }
    function notes(user, id, query = {}) {
        admin(user);
        const selectedPage = parse(page, query.page ?? 1);
        return transaction(db, () => { const invoice = context(id), rows = db.prepare('SELECT id,actor_id AS actorId,content,follow_up_on AS followUpOn,created_at AS createdAt FROM _finance_collection_notes WHERE invoice_id=? ORDER BY created_at DESC,id DESC LIMIT 26 OFFSET ?').all(id, (selectedPage - 1) * 25); return { invoiceId: id, identifier: invoice.identifier, sourceToken: hash(invoice), notes: rows.slice(0, 25), page: selectedPage, hasMore: rows.length > 25 }; });
    }
    function addNote(user, id, raw) { admin(user); parse(uuid, id); const d = parse(noteInput, raw); return command(user, d.requestKey, hash({ action: 'collection_note', invoiceId: id, ...d }), () => { const invoice = context(id); if (hash(invoice) !== d.sourceToken)
        fail('Invoice context changed. Reload before recording a collections note.', 409); db.prepare('INSERT INTO _finance_collection_notes(id,invoice_id,actor_id,content,follow_up_on,context_json) VALUES(?,?,?,?,?,?)').run(d.id, id, user.id, d.content, d.followUpOn, JSON.stringify(invoice)); return { id: d.id, invoiceId: id, recorded: true, communicationSent: false }; }); }
    return { list, notes, addNote, customerSummaryInTransaction, customerSummary };
}
