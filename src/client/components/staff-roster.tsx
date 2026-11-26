import { PersonnelDocumentsDialog } from "./personnel-documents";
import { useEffect, useState } from 'preact/hooks';
import { accountRequest, useAccount, canManagePeople, isAdministrator } from '../auth';
import { useApp } from '../context';
import { useConnectivity } from '../hooks/use-connectivity';
import { useGuardedCommand } from '../hooks/use-guarded-command';
import type { StaffRecord, StaffList, StaffHistory } from '../hr-types';
import { Dialog, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { TextField } from './ui/input';
import { Select } from './ui/select';
import { Notice, Badge, Checkbox, EmptyState, Table } from './ui/surfaces';
import { AccountPages } from './account-pages';
import { TechnicianAccounts } from './technician-accounts';
import './staff-roster.css';
const statuses = [{ value: 'active', label: 'Active' }, { value: 'on_leave', label: 'On leave' }, { value: 'inactive', label: 'Inactive' }, { value: 'terminated', label: 'Terminated' }];
function StaffForm({ row, disabled, close, saved }: {
    row: StaffRecord | null;
    disabled: boolean;
    close(): void;
    saved(): void;
}) {
    const [documentsOpen, setDocumentsOpen] = useState(false);
    const [id] = useState(() => row?.id ?? crypto.randomUUID()), [name, setName] = useState(row?.name ?? ''), [email, setEmail] = useState(row?.email ?? ''), [phone, setPhone] = useState(row?.phone ?? ''), [title, setTitle] = useState(row?.title ?? ''), [status, setStatus] = useState(row?.employment_status ?? 'active'), [start, setStart] = useState(row?.start_date ?? ''), [supervisor, setSupervisor] = useState(row?.supervisor_id ?? ''), [tech, setTech] = useState(!!row?.technician_enabled), [color, setColor] = useState(row?.color ?? '#16a34a'), [reason, setReason] = useState(''), [ack, setAck] = useState(false), [search, setSearch] = useState(''), [options, setOptions] = useState<{
        people: {
            id: string;
            name: string;
        }[];
        hasMore: boolean;
    } | null>(null), [lookupError, setLookupError] = useState(''), [history, setHistory] = useState<StaffHistory | null>(null), [historyPage, setHistoryPage] = useState(1), [historyError, setHistoryError] = useState('');
    const command = useGuardedCommand<Record<string, unknown>, {
        staff: StaffRecord;
    }>('/api/hr/staff', saved), locked = disabled || command.busy || command.uncertain;
    const supervisorChoices = (options?.people ?? []).filter(p => p.id !== id).map(p => ({ value: p.id, label: p.name }));
    if (supervisor && !supervisorChoices.some(p => p.value === supervisor))
        supervisorChoices.unshift({ value: supervisor, label: row?.supervisor_id === supervisor ? (row.supervisor_name || 'Retained supervisor') : 'Selected supervisor' });
    const disabling = !!row?.technician_active && (!tech || status !== 'active') && (row?.open_jobs ?? 0) > 0;
    useEffect(() => {
        let live = true;
        setLookupError('');
        void accountRequest<typeof options>('/api/hr/staff/options?' + new URLSearchParams({ search })).then(value => {
            if (live)
                setOptions(value);
        }).catch(e => {
            if (live)
                setLookupError((e as Error).message);
        });
        return () => { live = false; };
    }, [search]);
    useEffect(() => {
        if (!row)
            return;
        let live = true;
        setHistoryError('');
        void accountRequest<StaffHistory>(`/api/hr/staff/${row.id}/history?page=${historyPage}`).then(value => {
            if (live)
                setHistory(value);
        }).catch(e => {
            if (live)
                setHistoryError((e as Error).message);
        });
        return () => { live = false; };
    }, [row?.id, historyPage]);
    const changed = () => command.changed();
    function submit() {
        if (reason.trim().length < 10) {
            command.setError('Record a staff change reason of at least 10 characters.');
            return;
        }
        void command.run({ id, requestKey: crypto.randomUUID(), expectedVersion: row?.version ?? 0, name, email, phone, title, employmentStatus: status, startDate: start, supervisorId: supervisor || null, technician: tech, color, reason, acknowledgeOpenWork: ack });
    }
    return <Dialog class="bid-review-dialog staff-form-dialog" close={() => {
            if (command.canClose())
                close();
        }}><DialogTitle>{row ? 'Staff profile' : 'Add staff member'}</DialogTitle><p class="workspace-help">Employment details are managed here. Field Service uses the linked native technician; a staff profile does not create a login or grant access.</p>{command.error && <Notice tone="danger">{command.error}</Notice>}{command.uncertain && <Notice tone="warning">Outcome uncertain. Changes are locked; retry the exact staff command.</Notice>}
 <TextField label="Full name" value={name} maxLength={200} disabled={locked} onInput={e => { changed(); setName(e.currentTarget.value); }}/><div class="staff-form-grid"><TextField label="Work email" type="email" value={email} maxLength={254} disabled={locked} onInput={e => { changed(); setEmail(e.currentTarget.value); }}/><TextField label="Work phone" value={phone} maxLength={60} disabled={locked} onInput={e => { changed(); setPhone(e.currentTarget.value); }}/><TextField label="Job title" value={title} maxLength={200} disabled={locked} onInput={e => { changed(); setTitle(e.currentTarget.value); }}/><Select label="Employment status" value={status} disabled={locked} options={statuses} onValueChange={v => { changed(); setStatus(v as StaffRecord['employment_status']); setAck(false); }}/><TextField label="Employment start date (optional)" type="date" value={start} disabled={locked} onInput={e => { changed(); setStart(e.currentTarget.value); }}/></div>
 <TextField label="Find a supervisor" type="search" value={search} maxLength={200} disabled={locked} onInput={e => setSearch(e.currentTarget.value)}/>{lookupError && <Notice tone="warning">{lookupError}</Notice>}<Select label="Supervisor" value={supervisor || 'none'} disabled={locked} options={[{ value: 'none', label: 'No supervisor assigned' }, ...supervisorChoices]} onValueChange={v => { changed(); setSupervisor(v === 'none' ? '' : v); }}/>{options?.hasMore && <p class="workspace-help">Showing the first 100 active matches. Narrow the supervisor search.</p>}
 <Checkbox label="Available as a field technician" checked={tech} disabled={locked} onChange={e => { changed(); setTech(e.currentTarget.checked); setAck(false); }}/>{(tech || row?.technician_id) && <><TextField label="Dispatcher color" type="color" value={color} disabled={locked} onInput={e => { changed(); setColor(e.currentTarget.value); }}/><p class="workspace-help">Field availability also requires Active employment status. Disabling availability keeps the technician identity, job history, timecards, truck custody and account link.</p></>}{disabling && <Notice tone="warning">This technician has {row!.open_jobs} open jobs. Existing assignments will stay in place and must be reviewed in Dispatcher.<Checkbox label="I reviewed the open work and acknowledge the retained assignments." checked={ack} disabled={locked} onChange={e => { changed(); setAck(e.currentTarget.checked); }}/></Notice>}{status !== 'active' && <Notice tone="warning">Employment status does not revoke login sessions or change account roles. Review workspace access separately when placing someone on leave or ending employment.</Notice>}
 <TextField label="Change reason" value={reason} maxLength={2000} disabled={locked} onInput={e => { changed(); setReason(e.currentTarget.value); }}/><div class="staff-actions"><Button disabled={command.busy || command.uncertain} onClick={() => {
            if (command.canClose())
                close();
        }}>Cancel</Button><Button variant="primary" disabled={disabled || command.busy || (!command.uncertain && (!name.trim() || reason.trim().length < 10 || (disabling && !ack)))} onClick={submit}>{command.uncertain ? 'Retry exact command' : row ? 'Save staff profile' : 'Create staff member'}</Button></div>
        {row && <Button disabled={locked} onClick={() => setDocumentsOpen(true)}>Personnel documents</Button>}
        {row && documentsOpen && <PersonnelDocumentsDialog staffId={row.id} name={row.name} close={() => setDocumentsOpen(false)}/>}
 {row && <details class="sales-details"><summary>Employment / profile history</summary>{historyError && <Notice tone="warning">{historyError}</Notice>}{history?.rows.map(event => <article class="staff-history" key={event.id}><strong>{event.action.replaceAll('_', ' ')}</strong><small>{event.createdAt} UTC · {event.actorId}</small><p>{event.reason}</p><details><summary>Retained change details</summary><pre>{JSON.stringify({ before: event.before, after: event.after }, null, 2)}</pre></details></article>)}<div class="staff-actions"><Button disabled={historyPage <= 1} onClick={() => setHistoryPage(p => p - 1)}>Previous history</Button><span>Page {historyPage}</span><Button disabled={!history?.hasMore} onClick={() => setHistoryPage(p => p + 1)}>Next history</Button></div></details>}
 </Dialog>;
}
export function StaffRoster() {
    const { user } = useAccount(), { readOnly } = useConnectivity(), { refreshTechnicians, navigate } = useApp();
    const [data, setData] = useState<StaffList | null>(null), [page, setPage] = useState(1), [search, setSearch] = useState(''), [status, setStatus] = useState('all'), [revision, setRevision] = useState(0), [error, setError] = useState(''), [notice, setNotice] = useState(''), [editing, setEditing] = useState<StaffRecord | 'new' | null>(null), [accounts, setAccounts] = useState(false), [links, setLinks] = useState(false);
    useEffect(() => {
        let live = true;
        setError('');
        setData(null);
        void accountRequest<StaffList>('/api/hr/staff?' + new URLSearchParams({ page: String(page), search, status })).then(value => {
            if (live)
                setData(value);
        }).catch(e => {
            if (live)
                setError((e as Error).message);
        });
        return () => { live = false; };
    }, [page, search, status, revision]);
    if (!canManagePeople(user))
        return <div class="page"><h1>Staff</h1><Notice tone="danger">People administration access required.</Notice></div>;
    return <div class="page staff-roster-page"><header class="dispatch-title"><div><h1>Staff</h1><p class="workspace-help">Employee profiles and field availability. Existing technicians appear here even without a login account.</p></div><div class="staff-actions"><Button onClick={() => setRevision(r => r + 1)}>Refresh</Button><Button onClick={() => setAccounts(true)}>Workspace login access</Button>{isAdministrator(user) && <Button disabled={readOnly} onClick={() => setLinks(true)}>Link technician accounts</Button>}<Button variant="primary" disabled={readOnly} onClick={() => setEditing('new')}>Add staff member</Button></div></header>{error && <Notice tone="danger">{error}</Notice>}{notice && <Notice tone="success" close={() => setNotice('')}>{notice}</Notice>}<div class="staff-toolbar"><TextField label="Find staff" type="search" value={search} maxLength={200} onInput={e => { setSearch(e.currentTarget.value); setPage(1); }}/><Select label="Employment status" value={status} options={[{ value: 'all', label: 'All staff' }, ...statuses]} onValueChange={v => { setStatus(v); setPage(1); }}/></div>{!data && !error && <p role="status">Loading staff roster…</p>}{data && (data.rows.length ? <Table label="Staff roster"><thead><tr><th>Name / title</th><th>Work contact</th><th>Employment</th><th>Field Service</th><th>Supervisor</th><th>Access</th><th>Profile</th></tr></thead><tbody>{data.rows.map(person => <tr key={person.id}><th scope="row">{person.name}<small>{person.title || 'No title recorded'}</small></th><td>{person.email || '—'}<small>{person.phone || 'No phone recorded'}</small></td><td><Badge tone={person.employment_status === 'active' ? 'success' : 'neutral'}>{statuses.find(s => s.value === person.employment_status)?.label}</Badge></td><td>{person.technician_id ? <><Badge tone={person.technician_active ? 'info' : 'neutral'}>{person.technician_active ? 'Available technician' : 'Technician unavailable'}</Badge><small>{person.open_jobs} open jobs</small></> : 'Office / non-field staff'}</td><td>{person.supervisor_name || 'Not assigned'}</td><td>{person.user_id ? 'Technician login linked' : 'No technician login linked'}</td><td><Button onClick={() => setEditing(person)}>Open profile</Button></td></tr>)}</tbody></Table> : <EmptyState title="No staff match">Add a staff member or adjust your filters.</EmptyState>)}{data && <footer class="staff-actions"><Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button><span>{data.total} staff · Page {page}</span><Button disabled={page * 25 >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button><Button variant="ghost" onClick={() => navigate('/technicians')}>Open Field Service technicians</Button></footer>}{editing && <StaffForm row={editing === 'new' ? null : editing} disabled={readOnly} close={() => setEditing(null)} saved={() => { setEditing(null); setNotice('Staff profile saved. Native technician availability updated where linked.'); setRevision(r => r + 1); void refreshTechnicians().catch(() => setError('Staff saved. Refresh Field Service to reload technician lookups.')); }}/>}{accounts && <Dialog class="staff-access-dialog" close={() => setAccounts(false)}><DialogTitle>Workspace login access</DialogTitle><Button onClick={() => setAccounts(false)}>Close</Button><AccountPages view="users" id={null} title="Workspace accounts"/></Dialog>}{links && <TechnicianAccounts disabled={readOnly} close={() => { setLinks(false); setRevision(r => r + 1); }}/>}</div>;
}
