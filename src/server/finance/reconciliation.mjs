import { z } from 'zod';
import { createHash } from 'node:crypto';
import { ServiceIdentityError } from '../service/identity.mjs';
const fail = (message, status = 400) => { throw new ServiceIdentityError(message, status); };
const uuid = z.string().uuid(), note = z.string().trim().min(10).max(2000);
const date = z.string().refine(v => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Choose a valid received date.');
const common = { id: uuid, requestKey: uuid, sourceToken: z.string().regex(/^[a-f0-9]{64}$/), evidenceReference: note, note, reviewAttested: z.literal(true) };
const input = z.discriminatedUnion('resolution', [
    z.object({ ...common, resolution: z.literal('record_receipt'), paymentId: uuid, amountCents: z.number().int().min(1).max(10000000000).safe(), currency: z.literal('USD'), method: z.enum(['cash', 'check', 'bank_transfer', 'card', 'other']), reference: z.string().trim().max(200), paidOn: date }).strict(),
    z.object({ ...common, resolution: z.literal('reopen_unsubstantiated') }).strict(),
]);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** A reviewed resolution of a legacy flag, not bank/provider reconciliation. */
export function createLegacyReconciliation({ storage, admin, command, invoiceInTransaction, today }) {
    const db = storage.database;
    function reconcile(user, invoiceId, raw) {
        admin(user);
        if (!uuid.safeParse(invoiceId).success)
            fail('Choose a valid invoice.');
        const parsed = input.safeParse(raw);
        if (!parsed.success)
            fail(parsed.error.issues.map(i => i.message).join('; '));
        const d = parsed.data;
        return command(user, d.requestKey, hash({ action: 'reconcile_legacy_paid', invoiceId, ...d }), () => {
            const source = invoiceInTransaction(invoiceId);
            if (source.sourceToken !== d.sourceToken)
                fail('Invoice or payment history changed. Reload before reconciliation.', 409);
            if (!source.legacyPaidNeedsReconciliation || source.payments.length || source.legacyReconciliation)
                fail('This invoice no longer has an unresolved legacy paid flag.', 409);
            if (source.invoice.totalCents === 0)
                fail('A zero-dollar invoice needs a reviewed zero-value close workflow, not a payment record.', 409);
            if (db.prepare('SELECT 1 FROM _finance_legacy_reconciliations WHERE id=?').get(d.id))
                fail('This reconciliation identity already exists.', 409);
            if (d.resolution === 'record_receipt' && db.prepare('SELECT 1 FROM _finance_invoice_payments WHERE id=?').get(d.paymentId))
                fail('This receipt identity already exists.', 409);
            const original = db.prepare('SELECT id,identifier,customer_id,job_id,status,total,paid_date,due_date,created_at,updated_at FROM invoices WHERE id=?').get(invoiceId);
            let paymentId = null;
            if (d.resolution === 'record_receipt') {
                if (d.method !== 'cash' && !d.reference)
                    fail('Enter the check number or transaction/reference number.');
                if (d.amountCents > source.invoice.totalCents)
                    fail('The reviewed receipt exceeds the invoice total. Use a separate overpayment allocation workflow.', 409);
                if (d.paidOn > today())
                    fail('Received date cannot be in the future.', 409);
                paymentId = d.paymentId;
                db.prepare('INSERT INTO _finance_invoice_payments(id,invoice_id,amount_cents,currency,method,reference,paid_on,note,actor_id) VALUES(?,?,?,?,?,?,?,?,?)').run(paymentId, invoiceId, d.amountCents, d.currency, d.method, d.reference, d.paidOn, d.note, user.id);
            }
            db.prepare('INSERT INTO _finance_legacy_reconciliations(id,invoice_id,resolution,payment_id,evidence_reference,note,original_context_json,actor_id) VALUES(?,?,?,?,?,?,?,?)').run(d.id, invoiceId, d.resolution, paymentId, d.evidenceReference, d.note, JSON.stringify(original), user.id);
            const complete = d.resolution === 'record_receipt' && d.amountCents === source.invoice.totalCents;
            const unpaidStatus = date.safeParse(original.due_date).success && original.due_date < today() ? 'overdue' : 'sent';
            db.prepare('UPDATE invoices SET status=?,paid_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(complete ? 'paid' : unpaidStatus, complete ? d.paidOn : '', invoiceId);
            return { accounting: invoiceInTransaction(invoiceId), externalReconciled: false };
        });
    }
    return { reconcile };
}
