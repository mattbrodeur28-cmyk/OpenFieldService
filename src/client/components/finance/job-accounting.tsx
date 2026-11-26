import "./finance.css";
import { useEffect, useState } from 'preact/hooks';
import { accountRequest, useAccount, isAdministrator } from '../../auth';
import { useApp } from '../../context';
import { useConnectivity } from '../../hooks/use-connectivity';
import { useGuardedCommand } from '../../hooks/use-guarded-command';
import type { CustomerPo, JobAccountingData } from '../../finance-types';
import { Dialog, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { TextField } from '../ui/input';
import { Card, Notice, Textarea } from '../ui/surfaces';
function ReferenceDialog({ jobId, value, close, saved }: {
    jobId: string;
    value: CustomerPo;
    close(): void;
    saved(): void;
}) {
    const { readOnly } = useConnectivity(), [po, setPo] = useState(value.customerPo), [reason, setReason] = useState('');
    const command = useGuardedCommand<Record<string, unknown>, unknown>(`/api/service/jobs/${jobId}/accounting`, saved);
    const disabled = readOnly || command.busy || command.uncertain;
    function submit() { if (reason.trim().length < 10) {
        command.setError('Enter a reason of at least 10 characters.');
        return;
    } void command.run({ requestKey: crypto.randomUUID(), expectedVersion: value.version, customerPo: po, reason }); }
    const attemptClose = () => { if (command.canClose())
        close(); };
    return <Dialog class="bid-review-dialog finance-dialog" close={attemptClose}><DialogTitle>Customer purchase order</DialogTitle><p class="workspace-help">This is the customer’s authorization/reference. Your supplier material POs are separate native Purchasing records.</p>{command.error && <Notice tone="danger">{command.error}</Notice>}{command.uncertain && <Notice tone="warning">Outcome uncertain. Retry the exact command; editing is locked.</Notice>}<TextField label="Customer PO number" value={po} maxLength={200} disabled={disabled} onInput={e => { command.changed(); setPo(e.currentTarget.value); }}/><label class="ui-field">Change reason<Textarea value={reason} maxLength={2000} disabled={disabled} onInput={e => { command.changed(); setReason(e.currentTarget.value); }}/></label><div class="finance-actions"><Button disabled={command.busy || command.uncertain} onClick={attemptClose}>Cancel</Button><Button variant="primary" disabled={readOnly || command.busy} onClick={submit}>{command.uncertain ? 'Retry exact command' : 'Save customer PO'}</Button></div></Dialog>;
}
export function JobAccounting({ jobId }: {
    jobId: string;
}) {
    const { user } = useAccount(), { navigate } = useApp(), { readOnly } = useConnectivity();
    const [data, setData] = useState<JobAccountingData | null>(null), [error, setError] = useState(''), [refresh, setRefresh] = useState(0), [editing, setEditing] = useState(false), [invoicePage, setInvoicePage] = useState(1), [poPage, setPoPage] = useState(1);
    useEffect(() => { if (!isAdministrator(user))
        return; let live = true; setData(null); setError(''); void accountRequest<JobAccountingData>(`/api/service/jobs/${jobId}/accounting?invoicePage=${invoicePage}&poPage=${poPage}`).then(d => { if (live)
        setData(d); }).catch(e => { if (live)
        setError(e.message); }); return () => { live = false; }; }, [jobId, invoicePage, poPage, refresh, user?.id, user?.role]);
    if (!isAdministrator(user))
        return null;
    return <Card><header class="finance-heading"><h2>Accounting references</h2><Button disabled={editing} onClick={() => setRefresh(v => v + 1)}>Refresh</Button></header>{error && <Notice tone="danger">{error}</Notice>}{data && <><p><strong>Job / Work Order:</strong> {data.job.identifier}</p><p><strong>Customer PO:</strong> {data.customerPo.customerPo || 'Not supplied'}</p><Button disabled={readOnly} onClick={() => setEditing(true)}>Edit customer PO</Button><h3>Linked invoices</h3>{data.invoices.rows.length ? data.invoices.rows.map(invoice => <p key={invoice.id}><Button variant="ghost" onClick={() => navigate('/invoices/' + invoice.id)}>{invoice.identifier}</Button> · {invoice.status}</p>) : <p class="workspace-help">No invoice linked to this Job / Work Order.</p>}<div class="finance-actions"><Button disabled={invoicePage === 1} onClick={() => setInvoicePage(v => v - 1)}>Previous invoices</Button><Button disabled={!data.invoices.hasMore} onClick={() => setInvoicePage(v => v + 1)}>More invoices</Button></div><h3>Supplier material POs</h3>{data.supplierOrders === null ? <p class="workspace-help">Purchasing is not installed.</p> : <>{data.supplierOrders.rows.length ? data.supplierOrders.rows.map(po => <p key={po.id}><Button variant="ghost" onClick={() => navigate('/purchasing/' + po.id)}>{po.number}</Button> · {po.supplier} · {po.status}</p>) : <p class="workspace-help">No supplier PO lines allocated to this Job / Work Order.</p>}<div class="finance-actions"><Button disabled={poPage === 1} onClick={() => setPoPage(v => v - 1)}>Previous POs</Button><Button disabled={!data.supplierOrders.hasMore} onClick={() => setPoPage(v => v + 1)}>More POs</Button></div></>}<p class="workspace-help">PO commitments are separate from received material cost and customer payments. References do not post accounting transactions.</p>{editing && <ReferenceDialog jobId={jobId} value={data.customerPo} close={() => setEditing(false)} saved={() => { setEditing(false); setRefresh(v => v + 1); }}/>}</>}</Card>;
}
