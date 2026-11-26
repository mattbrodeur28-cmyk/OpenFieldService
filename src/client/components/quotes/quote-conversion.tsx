import { useEffect, useState } from 'preact/hooks';
import { accountRequest, useAccount, isAdministrator } from '../../auth';
import { useApp } from '../../context';
import { useConnectivity } from '../../hooks/use-connectivity';
import { useCompanyTimeZone } from '../../hooks/use-company-timezone';
import { useGuardedCommand } from '../../hooks/use-guarded-command';
import { dayInZone } from '../../dispatch-layout.mjs';
import { quoteMoney } from '../../quote-input.mjs';
import type { ConversionSummary, NativeChoice } from '../../quote-conversion-types';
import { SearchPicker } from './search-picker';
import { Dialog, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { TextField } from '../ui/input';
import { Select } from '../ui/select';
import { Card, Notice, Checkbox, Textarea, Badge } from '../ui/surfaces';
function ConversionDialog({ data, cancelling, close, saved }: {
    data: ConversionSummary;
    cancelling: boolean;
    close(): void;
    saved(): void;
}) {
    const company = useCompanyTimeZone(), { readOnly } = useConnectivity();
    const [customer, setCustomer] = useState(data.selected.customer), [site, setSite] = useState(data.selected.site), [asset, setAsset] = useState(data.selected.asset), [serviceType, setServiceType] = useState<NativeChoice | null>(null);
    const [planningDate, setPlanningDate] = useState(''), [duration, setDuration] = useState('60'), [priority, setPriority] = useState('normal'), [mappingNote, setMappingNote] = useState(''), [wonReason, setWonReason] = useState(''), [attested, setAttested] = useState(false);
    const command = useGuardedCommand<Record<string, unknown>, unknown>(`/api/sales/quotes/${data.quoteId}/conversion${cancelling ? '/cancel' : ''}`, saved);
    const locked = readOnly || command.busy || command.uncertain;
    useEffect(() => { if (company.timeZone && !planningDate)
        setPlanningDate(dayInZone(company.timeZone)); }, [company.timeZone]);
    const attemptClose = () => { if (command.canClose())
        close(); };
    const changed = (run: () => void) => { command.changed(); run(); };
    const base = `/api/sales/quotes/${data.quoteId}/conversion/options`;
    const selection = (choice: NativeChoice | null) => choice ? { id: choice.id, label: choice.name } : null;
    function submit() {
        if (mappingNote.trim().length < 10) {
            command.setError('Enter a review note of at least 10 characters.');
            return;
        }
        if (cancelling) {
            void command.run({ id: crypto.randomUUID(), requestKey: crypto.randomUUID(), expectedScheduleVersion: data.conversion?.job.scheduleVersion, note: mappingNote });
            return;
        }
        if (!customer || !site || !attested || !planningDate || wonReason.trim().length < 10) {
            command.setError('Choose the native customer and location, review the mapping, and enter a Won reason.');
            return;
        }
        if (!/^\d+$/.test(duration) || Number(duration) < 15 || Number(duration) > 1440) {
            command.setError('Estimated slot must be a whole number from 15 to 1440 minutes.');
            return;
        }
        void command.run({ id: crypto.randomUUID(), requestKey: crypto.randomUUID(), jobId: crypto.randomUUID(), offerId: data.offerId, acceptanceEventId: data.acceptanceEventId, expectedQuoteVersion: data.expectedQuoteVersion, expectedEventSequence: data.expectedEventSequence, expectedOpportunityVersion: data.expectedOpportunityVersion, customerId: customer.id, siteId: site.id, assetId: asset?.id ?? null, serviceTypeId: serviceType?.id ?? null, planningDate, durationMinutes: Number(duration), priority, mappingAttested: true, mappingNote, wonReason });
    }
    return <Dialog class="bid-review-dialog" close={attemptClose}>
  <DialogTitle>{cancelling ? 'Cancel converted Job / Work Order' : 'Convert accepted quote to Job / Work Order'}</DialogTitle>
  {command.error && <Notice tone="danger">{command.error}</Notice>}
  {command.uncertain && <Notice tone="warning">Outcome uncertain. Editing is locked. Retry the exact command before closing.</Notice>}
  {cancelling ? <Notice tone="warning">Cancel {data.conversion?.job.identifier}. The accepted quote, Won history and original Job remain retained. No replacement job or customer notification is created.</Notice> : <>
   <Notice>Creates one native unassigned Job and marks the original opportunity Won in the same transaction. The planning date is not a confirmed appointment. Purchase orders and invoices are separate actions.</Notice>
   {data.acceptedDocument && <details open><summary>Accepted scope and price</summary><p><strong>{data.acceptedDocument.title}</strong> · {quoteMoney(data.acceptedDocument.totalCents)}</p><p>Offered to {data.acceptedDocument.customerName}{data.acceptedDocument.siteName ? ` · ${data.acceptedDocument.siteName}` : ''}</p><p class="quote-document-text">{data.acceptedDocument.scope}</p></details>}
   <SearchPicker<NativeChoice> label="Customer" endpoint={`${base}?kind=customers`} selected={selection(customer)} format={row => row.name} disabled={locked || !!data.nativeLinks.customerId} change={row => changed(() => { setCustomer(row); setSite(null); setAsset(null); })}/>
   <SearchPicker<NativeChoice> key={`site:${customer?.id}`} label="Location" endpoint={`${base}?kind=sites&customerId=${customer?.id ?? ''}`} selected={selection(site)} format={row => row.name} disabled={locked || !customer || !!data.nativeLinks.siteId} change={row => changed(() => { setSite(row); setAsset(null); })}/>
   <SearchPicker<NativeChoice> key={`asset:${site?.id}`} label="Equipment (optional)" endpoint={`${base}?kind=assets&customerId=${customer?.id ?? ''}&siteId=${site?.id ?? ''}`} selected={selection(asset)} format={row => row.name} disabled={locked || !site || !!data.nativeLinks.assetId} change={row => changed(() => setAsset(row))}/>
   {asset && !data.nativeLinks.assetId && <Button disabled={locked} onClick={() => changed(() => setAsset(null))}>Clear equipment</Button>}
   <p class="workspace-help">Existing offered/opportunity links stay fixed. If equipment is unknown now, bind it at this location before Step 2; the post-work report requires equipment.</p>
   <SearchPicker<NativeChoice> label="Service type (optional)" endpoint={`${base}?kind=serviceTypes`} selected={selection(serviceType)} format={row => row.name} disabled={locked} change={row => changed(() => setServiceType(row))}/>
   {serviceType && <Button disabled={locked} onClick={() => changed(() => setServiceType(null))}>Clear service type</Button>}
   <div class="quote-date-fields"><TextField label="Planning date" type="date" value={planningDate} disabled={locked || !company.timeZone} onInput={e => changed(() => setPlanningDate(e.currentTarget.value))}/><TextField label="Estimated slot (minutes)" inputMode="numeric" value={duration} disabled={locked} onInput={e => changed(() => setDuration(e.currentTarget.value))}/></div>
   {company.error && <Notice tone="danger">{company.error}</Notice>}
   <Select label="Priority" value={priority} disabled={locked} options={['low', 'normal', 'high', 'urgent'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} onValueChange={value => changed(() => setPriority(value))}/>
   <Checkbox label="I matched this exact accepted scope to the existing customer, location and equipment above." checked={attested} disabled={locked} onChange={e => changed(() => setAttested(e.currentTarget.checked))}/>
   <label class="ui-field">Won / conversion reason<Textarea value={wonReason} maxLength={2000} disabled={locked} onInput={e => changed(() => setWonReason(e.currentTarget.value))}/></label>
  </>}
  <label class="ui-field">{cancelling ? 'Cancellation reason' : 'Native mapping review note'}<Textarea value={mappingNote} maxLength={2000} disabled={locked} onInput={e => changed(() => setMappingNote(e.currentTarget.value))}/></label>
  <div class="quote-actions"><Button disabled={command.busy || command.uncertain} onClick={attemptClose}>Cancel</Button><Button variant="primary" disabled={readOnly || command.busy} onClick={submit}>{command.uncertain ? 'Retry exact command' : cancelling ? 'Cancel retained Job' : 'Create native Job'}</Button></div>
 </Dialog>;
}
export function QuoteConversionPanel({ id, revision, disabled, reloaded, refreshKey }: {
    id: string;
    revision: number;
    disabled: boolean;
    reloaded(): void;
    refreshKey?: string;
}) {
    const { user } = useAccount(), { navigate } = useApp(), { readOnly } = useConnectivity();
    const [data, setData] = useState<ConversionSummary | null>(null), [error, setError] = useState(''), [refresh, setRefresh] = useState(0), [action, setAction] = useState<'convert' | 'cancel' | null>(null);
    useEffect(() => { let live = true; setData(null); setError(''); void accountRequest<ConversionSummary>(`/api/sales/quotes/${id}/conversion`).then(d => { if (live)
        setData(d); }).catch(e => { if (live)
        setError(e.message); }); return () => { live = false; }; }, [id, revision, refresh, refreshKey]);
    const admin = isAdministrator(user), current = !!data && revision === data.expectedQuoteVersion, linked = data?.conversion ?? data?.opportunityConversion;
    return <Card><header class="quote-header"><h2>Job / Work Order handoff</h2><Button disabled={!!action} onClick={() => setRefresh(v => v + 1)}>Refresh</Button></header>{error && <Notice tone="danger">{error}</Notice>}{data && <>
  {linked ? <><Badge tone={linked.job.status === 'cancelled' ? 'warning' : 'success'}>{linked.job.status === 'cancelled' ? 'Converted Job cancelled' : 'Converted to native Job'}</Badge><p>{linked.job.identifier} · {linked.job.status}</p><div class="quote-actions"><Button disabled={disabled} onClick={() => navigate('/jobs/' + linked.job.id)}>Open Job / Work Order</Button><Button disabled={disabled} onClick={() => navigate('/dispatcher')}>Open Dispatcher</Button><Button disabled={disabled} onClick={() => navigate('/sales/' + linked.opportunityId)}>Open opportunity</Button>{linked.quoteId !== id && <Button disabled={disabled} onClick={() => navigate('/sales/quotes/' + linked.quoteId)}>Open converted quote</Button>}</div><p class="workspace-help">One existing Job is retained even after cancellation. Quoted invoice preparation remains separate; the old material-addition invoice shortcut is blocked.</p>{data.conversion && admin && <><Button disabled={disabled || readOnly || !current || !!data.cancellationBlocker || data.conversion.job.scheduleVersion === null} onClick={() => setAction('cancel')}>Cancel unstarted Job</Button>{data.cancellationBlocker && <p class="workspace-help">{data.cancellationBlocker}</p>}</>}</> : <><p class="workspace-help">Acceptance retains the customer response. Explicit conversion creates the native Job and places unassigned work in Dispatcher.</p>{data.blockers.map(reason => <p class="workspace-help" key={reason}>{reason}</p>)}{admin && <Button variant="primary" disabled={disabled || readOnly || !current || !data.canConvert} onClick={() => setAction('convert')}>Convert accepted quote</Button>}</>}
  {!!data.conversionHistory?.length && <details><summary>Conversion history</summary>{data.conversionHistory.map(event => <div class="quote-summary-line" key={event.id}><strong>{event.action.replaceAll('_', ' ')}</strong><p>{event.note}</p><small>{event.createdAt} · Actor {event.actorId}</small></div>)}</details>}
  {action && <ConversionDialog data={data} cancelling={action === 'cancel'} close={() => setAction(null)} saved={() => { setAction(null); setRefresh(v => v + 1); reloaded(); }}/>}
 </>}</Card>;
}
