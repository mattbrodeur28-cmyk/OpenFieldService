import { useState } from 'preact/hooks';
import type { CreditRecord, InvoiceAccountingData } from '../../finance-types';
import { useConnectivity } from '../../hooks/use-connectivity';
import { useGuardedCommand } from '../../hooks/use-guarded-command';
import { quoteMoney, scaledInput } from '../../quote-input.mjs';
import { Dialog, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { TextField } from '../ui/input';
import { Notice, Textarea, Checkbox } from '../ui/surfaces';
export function CreditDialog({ data, reversal, close, saved }: {
    data: InvoiceAccountingData;
    reversal: CreditRecord | null;
    close(): void;
    saved(data: InvoiceAccountingData): void;
}) {
    const { readOnly } = useConnectivity();
    const [net, setNet] = useState(''), [tax, setTax] = useState('0'), [issuedOn, setIssuedOn] = useState(data.companyDate), [evidence, setEvidence] = useState(''), [note, setNote] = useState(''), [confirmed, setConfirmed] = useState(false);
    const command = useGuardedCommand<Record<string, unknown>, {
        accounting: InvoiceAccountingData;
    }>(reversal ? `/api/service/credits/${reversal.id}/reverse` : `/api/service/invoices/${data.invoice.id}/credits`, result => saved(result.accounting));
    const locked = readOnly || command.busy || command.uncertain;
    const attemptClose = () => { if (command.canClose())
        close(); };
    const identifier = reversal ? 'CN-' + String(reversal.number).padStart(6, '0') : '';
    function submit() {
        if (!confirmed || note.trim().length < 10) {
            command.setError('Review the accounting consequences and enter a reason of at least 10 characters.');
            return;
        }
        try {
            const base = { id: crypto.randomUUID(), requestKey: crypto.randomUUID(), sourceToken: data.sourceToken };
            if (reversal) {
                void command.run({ ...base, reason: note });
                return;
            }
            const netCents = scaledInput(net, 2, 'Net credit', 10000000000), taxCents = scaledInput(tax, 2, 'Tax credit', 10000000000);
            if (netCents < 0 || taxCents < 0 || netCents + taxCents <= 0)
                throw new Error('Enter nonnegative net and tax amounts with a positive total.');
            if (netCents + taxCents > (data.balanceCents ?? 0))
                throw new Error('Credit exceeds the current outstanding balance.');
            if (evidence.trim().length < 10)
                throw new Error('Describe the supporting evidence in at least 10 characters.');
            void command.run({ ...base, netCents, taxCents, currency: 'USD', issuedOn, evidenceReference: evidence, note, reviewAttested: true });
        }
        catch (e) {
            command.setError((e as Error).message);
        }
    }
    return <Dialog class="bid-review-dialog finance-dialog" close={attemptClose}><DialogTitle>{reversal ? 'Reverse credit note' : 'Issue credit note'}</DialogTitle><p class="workspace-help">{data.invoice.identifier} · Job / Work Order {data.invoice.jobIdentifier || 'not linked'}</p>{command.error && <Notice tone="danger">{command.error}</Notice>}{command.uncertain && <Notice tone="warning">Outcome uncertain. Editing is locked; retry the exact command.</Notice>}{reversal ? <Notice tone="warning">Reverse {identifier} for {quoteMoney(reversal.total_cents)}. This restores the outstanding balance and retains the original credit and reason. It does not collect money or change an external accounting system.</Notice> : <><Notice>Reduce this issued invoice’s unpaid balance. A credit is not a receipt or refund. Review the original invoice’s net and tax amounts; no current tax profile is applied.</Notice><p>Original net: {data.invoice.subtotalCents === null ? 'Needs review' : quoteMoney(data.invoice.subtotalCents)} · Original tax: {data.invoice.taxCents === null ? 'Needs review' : quoteMoney(data.invoice.taxCents)}</p><p>Active credits: {quoteMoney(data.creditedCents)} · Outstanding: {data.balanceCents === null ? 'Unknown' : quoteMoney(data.balanceCents)}</p><TextField label="Net amount to credit ($)" value={net} inputMode="decimal" disabled={locked} onInput={e => { command.changed(); setNet(e.currentTarget.value); }}/><TextField label="Original tax amount to credit ($)" value={tax} inputMode="decimal" disabled={locked} onInput={e => { command.changed(); setTax(e.currentTarget.value); }}/><TextField label="Credit date" type="date" value={issuedOn} max={data.companyDate} disabled={locked} onInput={e => { command.changed(); setIssuedOn(e.currentTarget.value); }}/><TextField label="Supporting evidence / reference" value={evidence} maxLength={2000} disabled={locked} onInput={e => { command.changed(); setEvidence(e.currentTarget.value); }}/></>}<label class="ui-field">{reversal ? 'Reversal reason' : 'Credit reason'}<Textarea value={note} maxLength={2000} disabled={locked} onInput={e => { command.changed(); setNote(e.currentTarget.value); }}/></label><Checkbox label={reversal ? 'I reviewed this reversal and its effect on the outstanding balance.' : 'I reviewed the original invoice, evidence, net and tax amounts and approve this credit.'} checked={confirmed} disabled={locked} onChange={e => { command.changed(); setConfirmed(e.currentTarget.checked); }}/><p class="workspace-help">No customer message, refund, bank transaction or QuickBooks posting is sent.</p><div class="finance-actions"><Button disabled={command.busy || command.uncertain} onClick={attemptClose}>Cancel</Button><Button variant="primary" disabled={readOnly || command.busy} onClick={submit}>{command.uncertain ? 'Retry exact command' : reversal ? 'Reverse credit note' : 'Issue reviewed credit'}</Button></div></Dialog>;
}
