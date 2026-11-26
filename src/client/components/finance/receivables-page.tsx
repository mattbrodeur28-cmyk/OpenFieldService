import { useEffect, useState } from 'preact/hooks';
import { accountRequest, isAdministrator, useAccount } from '../../auth';
import { useApp } from '../../context';
import { useConnectivity } from '../../hooks/use-connectivity';
import { useGuardedCommand } from '../../hooks/use-guarded-command';
import { quoteMoney } from '../../quote-input.mjs';
import type { AgingBucket, CollectionsData, ReceivablesData } from '../../finance-types';
import { Dialog, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { TextField } from '../ui/input';
import { Select } from '../ui/select';
import { Card, Notice, Textarea, EmptyState, Badge } from '../ui/surfaces';
import './finance.css';
const labels: Record<AgingBucket, string> = { current: 'Current / not yet due', '1_30': '1–30 days', '31_60': '31–60 days', '61_90': '61–90 days', over_90: 'Over 90 days', undated: 'Due date unresolved', review: 'Reconciliation needed' };
function CollectionsDialog({ invoiceId, close, changed }: {
    invoiceId: string;
    close(): void;
    changed(): void;
}) {
    const { readOnly } = useConnectivity();
    const [data, setData] = useState<CollectionsData | null>(null), [error, setError] = useState(''), [page, setPage] = useState(1), [refresh, setRefresh] = useState(0), [content, setContent] = useState(''), [followUp, setFollowUp] = useState('');
    const command = useGuardedCommand<Record<string, unknown>, unknown>(`/api/service/invoices/${invoiceId}/collections`, () => { setContent(''); setFollowUp(''); setPage(1); setRefresh(v => v + 1); changed(); });
    useEffect(() => { let live = true; setError(''); setData(null); void accountRequest<CollectionsData>(`/api/service/invoices/${invoiceId}/collections?page=${page}`).then(d => { if (live)
        setData(d); }).catch(e => { if (live)
        setError(e.message); }); return () => { live = false; }; }, [invoiceId, page, refresh]);
    const locked = readOnly || command.busy || command.uncertain, attemptClose = () => { if (command.canClose())
        close(); };
    function submit() { if (!data)
        return; if (content.trim().length < 10) {
        command.setError('Enter a collections note of at least 10 characters.');
        return;
    } void command.run({ id: crypto.randomUUID(), requestKey: crypto.randomUUID(), sourceToken: data.sourceToken, content, followUpOn: followUp }); }
    return <Dialog class="bid-review-dialog finance-dialog" close={attemptClose}><DialogTitle>Collections notes{data ? ` · ${data.identifier}` : ''}</DialogTitle>{error && <Notice tone="danger">{error}</Notice>}{command.error && <Notice tone="danger">{command.error}</Notice>}{command.uncertain && <Notice tone="warning">Outcome uncertain. Retry the exact command; editing is locked.</Notice>}{!data && !error && <p role="status">Loading collections history…</p>}{data && <><label class="ui-field">Internal collections note<Textarea value={content} maxLength={4000} disabled={locked} onInput={e => { command.changed(); setContent(e.currentTarget.value); }}/></label><TextField label="Follow-up date (optional)" type="date" value={followUp} disabled={locked} onInput={e => { command.changed(); setFollowUp(e.currentTarget.value); }}/><p class="workspace-help">Retains an internal record. This does not send a customer message, schedule an automated reminder or reconcile a payment.</p><Button variant="primary" disabled={command.busy || readOnly} onClick={submit}>{command.uncertain ? 'Retry exact command' : 'Record collections note'}</Button><h3>Retained history</h3>{data.notes.length ? data.notes.map(note => <article class="finance-ledger-row" key={note.id}><p class="finance-note-text">{note.content}</p>{note.followUpOn && <span>Follow up: {note.followUpOn}</span>}<small>{note.createdAt} · Actor {note.actorId}</small></article>) : <p class="workspace-help">No collections notes recorded.</p>}<div class="finance-actions"><Button disabled={command.busy || command.uncertain || page === 1} onClick={() => setPage(v => v - 1)}>Newer</Button><span>Page {page}</span><Button disabled={command.busy || command.uncertain || !data.hasMore} onClick={() => setPage(v => v + 1)}>Older</Button></div></>}<div class="finance-actions"><Button disabled={command.busy || command.uncertain} onClick={attemptClose}>Close</Button></div></Dialog>;
}
export function ReceivablesPage() {
    const { user } = useAccount(), { navigate } = useApp();
    const [data, setData] = useState<ReceivablesData | null>(null), [search, setSearch] = useState(''), [state, setState] = useState('open'), [bucket, setBucket] = useState('all'), [page, setPage] = useState(1), [refresh, setRefresh] = useState(0), [error, setError] = useState(''), [notesId, setNotesId] = useState<string | null>(null);
    useEffect(() => { if (!isAdministrator(user))
        return; let live = true; setData(null); setError(''); const timer = setTimeout(() => { void accountRequest<ReceivablesData>('/api/service/receivables?' + new URLSearchParams({ search, state, bucket, page: String(page) })).then(d => { if (live)
        setData(d); }).catch(e => { if (live)
        setError(e.message); }); }, 180); return () => { live = false; clearTimeout(timer); }; }, [search, state, bucket, page, refresh, user?.id, user?.role]);
    if (!isAdministrator(user))
        return <div class="page"><h1>Receivables</h1><Notice tone="warning">Owner or administrator accounting access required.</Notice></div>;
    return <div class="page receivables-page"><header class="finance-heading"><div><h1>Receivables</h1><p class="workspace-help">Issued invoices, retained receipts and collections · Live native records</p></div><div class="finance-actions"><Button disabled={!!notesId} onClick={() => navigate('/invoices')}>Invoices</Button><Button disabled={!!notesId} onClick={() => setRefresh(v => v + 1)}>Refresh</Button></div></header>
  <div class="receivables-filters"><TextField label="Search invoices, customers, Jobs or customer PO" type="search" value={search} maxLength={200} disabled={!!notesId} onInput={e => { setSearch(e.currentTarget.value); setPage(1); }}/><Select label="Invoice scope" value={state} disabled={!!notesId} options={[{ value: 'open', label: 'Outstanding + unresolved' }, { value: 'all', label: 'All issued invoices' }, { value: 'review', label: 'Reconciliation needed' }]} onValueChange={value => { setState(value); setPage(1); }}/><Select label="Aging bucket" value={bucket} disabled={!!notesId} options={[{ value: 'all', label: 'All aging buckets' }, ...Object.entries(labels).map(([value, label]) => ({ value, label }))]} onValueChange={value => { setBucket(value); setPage(1); }}/></div>
  {error && <Notice tone="danger">{error}</Notice>}{!data && !error && <p role="status">Loading receivables…</p>}{data && <>
   <p class="workspace-help">As of {data.companyDate} · USD · Summary follows search and invoice scope across all pages. Aging uses due date, not a manually selected overdue flag.</p>
   <section class="receivables-aging" aria-label="Aging summary">{data.summary.map(item => <button type="button" key={item.bucket} class={`ui-card ${bucket === item.bucket ? 'active' : ''}`} aria-pressed={bucket === item.bucket} disabled={!!notesId} onClick={() => { setBucket(bucket === item.bucket ? 'all' : item.bucket); setPage(1); }}><span>{labels[item.bucket]}</span><strong>{item.amountCents === null ? `${item.count} to review` : quoteMoney(item.amountCents)}</strong><small>{item.count} {item.count === 1 ? 'invoice' : 'invoices'}</small></button>)}</section>
   <p><strong>Known outstanding:</strong> {quoteMoney(data.knownBalanceCents)}{data.unresolvedCount > 0 && <> · <strong>{data.unresolvedCount} unresolved</strong> (excluded from the known amount)</>}</p>
   {data.unresolvedCount > 0 && <Notice tone="warning">Some records lack usable receipt evidence or exact amounts. Review their original invoice and payment history; an old paid flag is not a receipt.</Notice>}
   {!data.rows.length ? <EmptyState title="No invoices match">Draft and cancelled invoices are excluded from receivables. Adjust your search, scope or aging bucket.</EmptyState> : <div class="finance-table-scroll"><table class="finance-table"><thead><tr><th>Invoice / customer</th><th>Job / customer PO</th><th>Due date</th><th>Aging</th><th>Total</th><th>Outstanding</th><th>Collections</th></tr></thead><tbody>{data.rows.map(row => <tr key={row.id}><td><Button variant="ghost" onClick={() => navigate('/invoices/' + row.id)}>{row.identifier}</Button><small>{row.customer_name} · {row.status}</small></td><td>{row.job_id ? <Button variant="ghost" onClick={() => navigate('/jobs/' + row.job_id)}>{row.job_identifier}</Button> : <span>Not linked</span>}<small>Customer PO: {row.customer_po || 'Not supplied'}</small></td><td>{row.due_date || 'Not set'}</td><td><Badge tone={row.aging_bucket === 'review' ? 'warning' : row.days_past_due !== null && row.days_past_due > 0 ? 'danger' : 'info'}>{labels[row.aging_bucket]}</Badge></td><td>{row.total_cents === null ? 'Review amount' : quoteMoney(row.total_cents)}</td><td><strong>{row.balance_cents === null ? 'Needs reconciliation' : quoteMoney(row.balance_cents)}</strong></td><td><Button onClick={() => setNotesId(row.id)}>Notes / follow-up</Button></td></tr>)}</tbody></table></div>}
   <div class="finance-actions"><Button disabled={page === 1 || !!notesId} onClick={() => setPage(v => v - 1)}>Previous</Button><span>Page {data.page} · {data.total} matching invoices</span><Button disabled={page * data.pageSize >= data.total || !!notesId} onClick={() => setPage(v => v + 1)}>Next</Button></div>
   <p class="workspace-help">Customer and supplier POs remain separate on the Job / Invoice. Credits, deposits, refunds, legacy reconciliation and bank/QuickBooks matching remain separate workflows.</p>
  </>}{notesId && <CollectionsDialog invoiceId={notesId} close={() => setNotesId(null)} changed={() => setRefresh(v => v + 1)}/>}</div>;
}
