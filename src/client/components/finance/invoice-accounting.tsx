import { CreditDialog } from "./credit-dialog";
import { LegacyReconciliationDialog } from "./legacy-reconciliation";
import "./finance.css";
import { useEffect, useState } from 'preact/hooks';
import { accountRequest, useAccount, isAdministrator } from '../../auth';
import { useApp } from '../../context';
import { useConnectivity } from '../../hooks/use-connectivity';
import { useGuardedCommand } from '../../hooks/use-guarded-command';
import { quoteMoney, scaledInput, scaledText } from '../../quote-input.mjs';
import type { InvoiceAccountingData, PaymentRecord, CreditRecord } from '../../finance-types';
import { Dialog, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { TextField } from '../ui/input';
import { Select } from '../ui/select';
import { Card, Notice, Textarea, Checkbox, Badge } from '../ui/surfaces';
const labels: Record<string, string> = { cash: 'Cash', check: 'Check', bank_transfer: 'Bank transfer', card: 'Card', other: 'Other' };
function PaymentDialog({ data, reversal, close, saved }: {
    data: InvoiceAccountingData;
    reversal: PaymentRecord | null;
    close(): void;
    saved(data: InvoiceAccountingData): void;
}) {
    const { readOnly } = useConnectivity(), [method, setMethod] = useState('check'), [reference, setReference] = useState(''), [amount, setAmount] = useState(scaledText(data.balanceCents ?? 0, 2)), [paidOn, setPaidOn] = useState(data.companyDate), [note, setNote] = useState(''), [confirmed, setConfirmed] = useState(false);
    const path = reversal ? `/api/service/payments/${reversal.id}/reverse` : `/api/service/invoices/${data.invoice.id}/payments`;
    const command = useGuardedCommand<Record<string, unknown>, {
        accounting: InvoiceAccountingData;
    }>(path, result => saved(result.accounting));
    const disabled = readOnly || command.busy || command.uncertain, attemptClose = () => {
        if (command.canClose())
            close();
    };
    function submit() {
        if (!confirmed || note.trim().length < 10) {
            command.setError('Review and confirm the record, with a note of at least 10 characters.');
            return;
        }
        try {
            const base = { id: crypto.randomUUID(), requestKey: crypto.randomUUID(), sourceToken: data.sourceToken };
            void command.run(reversal ? { ...base, reason: note } : { ...base, amountCents: scaledInput(amount, 2, 'Payment amount', 10000000000), currency: 'USD', method, reference, paidOn, note, receivedAttested: true });
        }
        catch (e) {
            command.setError((e as Error).message);
        }
    }
    return <Dialog class="bid-review-dialog finance-dialog" close={attemptClose}><DialogTitle>{reversal ? 'Reverse payment record' : 'Record received payment'}</DialogTitle><p class="workspace-help">{data.invoice.identifier} · Job / Work Order {data.invoice.jobIdentifier || 'not linked'}</p>{command.error && <Notice tone="danger">{command.error}</Notice>}{command.uncertain && <Notice tone="warning">Outcome uncertain. Editing is locked; retry the exact command.</Notice>}{reversal ? <Notice tone="warning">Reverse the retained {labels[reversal.method]} receipt of {quoteMoney(reversal.amount_cents)}. This does not send a refund, stop a check or reverse a bank transaction.</Notice> : <><Notice>Record money already received. This action does not charge a card, clear a check, contact a bank or reconcile QuickBooks.</Notice><Select label="Payment method" value={method} disabled={disabled} options={Object.entries(labels).map(([value, label]) => ({ value, label }))} onValueChange={value => { command.changed(); setMethod(value); setReference(''); }}/><TextField label={method === 'check' ? 'Check number' : method === 'cash' ? 'Cash receipt number (optional)' : 'Transaction / reference number'} value={reference} maxLength={200} disabled={disabled} onInput={e => { command.changed(); setReference(e.currentTarget.value); }}/><TextField label="Amount received ($)" value={amount} inputMode="decimal" disabled={disabled} onInput={e => { command.changed(); setAmount(e.currentTarget.value); }}/><TextField label="Received on" type="date" value={paidOn} disabled={disabled} onInput={e => { command.changed(); setPaidOn(e.currentTarget.value); }}/></>}<label class="ui-field">{reversal ? 'Reversal reason' : 'Receipt / accounting note'}<Textarea value={note} maxLength={2000} disabled={disabled} onInput={e => { command.changed(); setNote(e.currentTarget.value); }}/></label><Checkbox label={reversal ? 'I reviewed the receipt and its accounting consequences. This is a record reversal, not a refund.' : 'I confirmed this payment was received and reviewed the amount and reference.'} checked={confirmed} disabled={disabled} onChange={e => { command.changed(); setConfirmed(e.currentTarget.checked); }}/><div class="finance-actions"><Button disabled={command.busy || command.uncertain} onClick={attemptClose}>Cancel</Button><Button variant="primary" disabled={readOnly || command.busy} onClick={submit}>{command.uncertain ? 'Retry exact command' : reversal ? 'Reverse record' : 'Save payment record'}</Button></div></Dialog>;
}
export function InvoiceAccounting({ invoiceId, onLedgerChange }: {
    invoiceId: string;
    onLedgerChange?(present: boolean): void;
}) {
    const { user } = useAccount(), { navigate, selectInvoice } = useApp(), { readOnly } = useConnectivity();
    const [credit, setCredit] = useState<CreditRecord | 'new' | null>(null);
    const [data, setData] = useState<InvoiceAccountingData | null>(null), [error, setError] = useState(''), [refresh, setRefresh] = useState(0), [editing, setEditing] = useState(false), [reconciling, setReconciling] = useState(false), [reversal, setReversal] = useState<PaymentRecord | null>(null);
    useEffect(() => {
        if (!isAdministrator(user))
            return;
        let live = true;
        setData(null);
        setError('');
        void accountRequest<InvoiceAccountingData>(`/api/service/invoices/${invoiceId}/accounting`).then(d => {
            if (live) {
                setData(d);
                onLedgerChange?.(d.payments.length > 0 || d.credits.length > 0 || !!d.legacyReconciliation);
            }
        }).catch(e => {
            if (live)
                setError(e.message);
        });
        return () => { live = false; };
    }, [invoiceId, refresh, user?.id, user?.role]);
    if (!isAdministrator(user))
        return null;
    return <Card><header class="finance-heading"><h2>Payments, credits and PO references</h2><Button disabled={editing || reconciling || !!credit} onClick={() => setRefresh(v => v + 1)}>Refresh</Button></header>{error && <Notice tone="danger">{error}</Notice>}{data && <><p><strong>Job / Work Order:</strong> {data.invoice.jobId ? <Button variant="ghost" onClick={() => navigate('/jobs/' + data.invoice.jobId)}>{data.invoice.jobIdentifier}</Button> : 'Not linked'}</p><p><strong>Customer PO:</strong> {data.customerPo?.customerPo || 'Not supplied'} <small class="text-muted">(current Job reference)</small></p><h3>Supplier material POs</h3>{data.supplierOrders?.rows.map(po => <p key={po.id}><Button variant="ghost" onClick={() => navigate('/purchasing/' + po.id)}>{po.number}</Button> · {po.supplier}</p>)}{!data.supplierOrders?.rows.length && <p class="workspace-help">No supplier PO lines linked through this Job / Work Order.</p>}{data.supplierOrders?.hasMore && data.invoice.jobId && <Button onClick={() => navigate('/jobs/' + data.invoice.jobId)}>View all linked POs on Job</Button>}<p><strong>Recorded receipts:</strong> {data.paidCents === null ? 'Needs reconciliation' : quoteMoney(data.paidCents)} · <strong>Active credits:</strong> {quoteMoney(data.creditedCents)} · <strong>Outstanding:</strong> {data.balanceCents === null ? 'Unknown' : quoteMoney(data.balanceCents)}</p>{data.legacyPaidNeedsReconciliation && <Notice tone="warning">This invoice was previously marked paid without a receipt ledger. Its payment method and balance need reconciliation; no payment amount is inferred.</Notice>}{data.legacyPaidNeedsReconciliation && <Button disabled={readOnly} onClick={() => setReconciling(true)}>Review legacy paid status</Button>}{data.legacyReconciliation && <details><summary>Retained legacy status review</summary><p>{data.legacyReconciliation.resolution === 'record_receipt' ? 'An evidenced receipt was recorded.' : 'Unsupported paid status was reopened without a receipt.'}</p><p>{data.legacyReconciliation.note}</p><p>Evidence: {data.legacyReconciliation.evidenceReference}</p><small>{data.legacyReconciliation.createdAt} · Actor {data.legacyReconciliation.actorId}</small></details>}
        <Button variant="primary" disabled={readOnly || data.legacyPaidNeedsReconciliation || !['sent', 'overdue'].includes(data.invoice.status) || (data.balanceCents ?? 0) <= 0} onClick={() => { setReversal(null); setEditing(true); }}>Record payment</Button>{data.payments.map(payment => <article class="finance-ledger-row" key={payment.id}><strong>{quoteMoney(payment.amount_cents)} · {labels[payment.method]} · {payment.paid_on}</strong><span>{payment.method === 'check' ? 'Check #' : payment.method === 'cash' ? 'Cash receipt #' : 'Transaction / reference #'} {payment.reference || 'Not supplied'}</span><p>{payment.note}</p>{payment.reversal_id ? <><Badge tone="warning">Record reversed</Badge><p>{payment.reversal_reason}</p></> : <Button disabled={readOnly} onClick={() => { setReversal(payment); setEditing(true); }}>Reverse record</Button>}</article>)}<section aria-label="Invoice credit notes"><h3>Credit notes</h3><Button disabled={readOnly || data.legacyPaidNeedsReconciliation || !['sent', 'overdue'].includes(data.invoice.status) || (data.balanceCents ?? 0) <= 0 || data.invoice.subtotalCents === null || data.invoice.taxCents === null || data.invoice.subtotalCents + data.invoice.taxCents !== data.invoice.totalCents} onClick={() => setCredit('new')}>Issue credit note</Button>{data.credits.map(entry => <article class="finance-ledger-row" key={entry.id}><strong>CN-{String(entry.number).padStart(6, '0')} · {quoteMoney(entry.total_cents)} · {entry.issued_on}</strong><span>Net {quoteMoney(entry.net_cents)} · Original tax {quoteMoney(entry.tax_cents)}</span><p class="finance-note-text">{entry.note}</p><p class="finance-note-text">Evidence: {entry.evidence_reference}</p><small>Recorded {entry.created_at} · Actor {entry.actor_id}</small>{entry.reversal_id ? <><Badge tone="warning">Credit reversed</Badge><p class="finance-note-text">{entry.reversal_reason}</p><small>Reversed {entry.reversed_at}</small></> : <Button disabled={readOnly} onClick={() => setCredit(entry)}>Reverse credit note</Button>}</article>)}{!data.credits.length && <p class="workspace-help">No credit notes recorded.</p>}<p class="workspace-help">Credits reduce debt without creating receipts. A settled invoice may include credits; its status alone does not establish cash received.</p></section>{credit && <CreditDialog data={data} reversal={credit === 'new' ? null : credit} close={() => setCredit(null)} saved={next => { setData(next); onLedgerChange?.(true); setCredit(null); void selectInvoice(invoiceId).catch(() => setError('Credit saved; refresh the invoice header to reload its status.')); }}/>}<p class="workspace-help">Receipts, customer PO and supplier POs are separate values. Recorded receipt does not establish bank clearance or provider reconciliation.</p>{reconciling && <LegacyReconciliationDialog data={data} close={() => setReconciling(false)} saved={next => { setData(next); onLedgerChange?.(true); setReconciling(false); void selectInvoice(invoiceId).catch(() => setError('Legacy resolution saved; refresh the invoice header to reload its status.')); }}/>}{editing && <PaymentDialog data={data} reversal={reversal} close={() => setEditing(false)} saved={next => { setData(next); onLedgerChange?.(next.payments.length > 0 || next.credits.length > 0 || !!next.legacyReconciliation); setEditing(false); setReversal(null); void selectInvoice(invoiceId).catch(() => setError('Payment record saved; refresh the invoice header to reload its status.')); }}/>}</>}</Card>;
}
