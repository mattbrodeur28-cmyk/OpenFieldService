import { useState } from 'preact/hooks';
import { useConnectivity } from '../../hooks/use-connectivity';
import { useGuardedCommand } from '../../hooks/use-guarded-command';
import { scaledInput, quoteMoney } from '../../quote-input.mjs';
import type { InvoiceAccountingData } from '../../finance-types';
import { Dialog, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { TextField } from '../ui/input';
import { Select } from '../ui/select';
import { Notice, Textarea, Checkbox } from '../ui/surfaces';
export function LegacyReconciliationDialog({ data, close, saved }: {
    data: InvoiceAccountingData;
    close(): void;
    saved(data: InvoiceAccountingData): void;
}) {
    const { readOnly } = useConnectivity();
    const [resolution, setResolution] = useState('record_receipt'), [amount, setAmount] = useState(''), [method, setMethod] = useState(''), [reference, setReference] = useState(''), [paidOn, setPaidOn] = useState(''), [evidence, setEvidence] = useState(''), [note, setNote] = useState(''), [attested, setAttested] = useState(false);
    const command = useGuardedCommand<Record<string, unknown>, {
        accounting: InvoiceAccountingData;
    }>(`/api/service/invoices/${data.invoice.id}/reconcile-legacy`, result => saved(result.accounting));
    const locked = readOnly || command.busy || command.uncertain, attemptClose = () => { if (command.canClose())
        close(); }, change = (run: () => void) => { command.changed(); run(); };
    function submit() {
        if (!attested || note.trim().length < 10 || evidence.trim().length < 10) {
            command.setError('Review the original records, provide an evidence reference and review note, and confirm the resolution.');
            return;
        }
        try {
            const value: Record<string, unknown> = { id: crypto.randomUUID(), requestKey: crypto.randomUUID(), sourceToken: data.sourceToken, resolution, evidenceReference: evidence, note, reviewAttested: true };
            if (resolution === 'record_receipt') {
                if (!method || !paidOn) {
                    command.setError('Choose the actual payment method and received date.');
                    return;
                }
                Object.assign(value, { paymentId: crypto.randomUUID(), amountCents: scaledInput(amount, 2, 'Reviewed amount received', 10000000000), currency: 'USD', method, reference, paidOn });
            }
            void command.run(value);
        }
        catch (error) {
            command.setError((error as Error).message);
        }
    }
    return <Dialog class="bid-review-dialog finance-dialog" close={attemptClose}>
  <DialogTitle>Review legacy paid status</DialogTitle>
  <p class="workspace-help">{data.invoice.identifier} · Original invoice total {quoteMoney(data.invoice.totalCents)}</p>
  <Notice>The old paid flag does not establish a payment amount or method. Choose a resolution from actual retained records. The original invoice context and your review stay in history.</Notice>
  {command.error && <Notice tone="danger">{command.error}</Notice>}{command.uncertain && <Notice tone="warning">Outcome uncertain. Retry the exact command; editing is locked.</Notice>}
  <Select label="Reviewed resolution" value={resolution} disabled={locked} options={[{ value: 'record_receipt', label: 'Record an evidenced receipt' }, { value: 'reopen_unsubstantiated', label: 'Reopen unsupported paid status as unpaid' }]} onValueChange={value => change(() => { setResolution(value); setAttested(false); })}/>
  {resolution === 'record_receipt' ? <>
   <TextField label="Actual amount received ($)" inputMode="decimal" value={amount} disabled={locked} onInput={e => change(() => setAmount(e.currentTarget.value))}/>
   <Select label="Actual payment method" value={method || 'choose'} disabled={locked} options={[{ value: 'choose', label: 'Choose the evidenced method', disabled: true }, ...Object.entries({ cash: 'Cash', check: 'Check', bank_transfer: 'Bank transfer', card: 'Card', other: 'Other' }).map(([value, label]) => ({ value, label }))]} onValueChange={value => change(() => { setMethod(value); setReference(''); })}/>
   <TextField label={method === 'check' ? 'Check number' : method === 'cash' ? 'Cash receipt number (optional)' : 'Transaction / reference number'} value={reference} maxLength={200} disabled={locked} onInput={e => change(() => setReference(e.currentTarget.value))}/>
   <TextField label="Actual received date" type="date" value={paidOn} disabled={locked} onInput={e => change(() => setPaidOn(e.currentTarget.value))}/>
   <p class="workspace-help">An evidenced partial receipt reopens only the remaining balance. A full receipt retains the paid status. No bank clearance or external reconciliation is implied.</p>
  </> : <Notice tone="warning">This reopens the full invoice balance as unpaid without creating a zero-dollar receipt. Confirm that your review supports removing the old paid flag. No customer message is sent.</Notice>}
  <TextField label="Retained evidence reference" hint="For example, an archived receipt or the accounting review record. The app does not fetch this reference." value={evidence} maxLength={2000} disabled={locked} onInput={e => change(() => setEvidence(e.currentTarget.value))}/>
  <label class="ui-field">Accounting review note<Textarea value={note} maxLength={2000} disabled={locked} onInput={e => change(() => setNote(e.currentTarget.value))}/></label>
  <Checkbox label="I reviewed the original invoice and payment evidence and authorize this specific resolution." checked={attested} disabled={locked} onChange={e => change(() => setAttested(e.currentTarget.checked))}/>
  <div class="finance-actions"><Button disabled={command.busy || command.uncertain} onClick={attemptClose}>Cancel</Button><Button variant="primary" disabled={readOnly || command.busy} onClick={submit}>{command.uncertain ? 'Retry exact command' : 'Record reviewed resolution'}</Button></div>
 </Dialog>;
}
