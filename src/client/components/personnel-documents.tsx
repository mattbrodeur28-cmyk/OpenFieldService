import './staff-roster.css';
import { useEffect, useState } from 'preact/hooks';
import { accountRequest, AccountRequestError } from '../auth';
import { useConnectivity } from '../hooks/use-connectivity';
import { useGuardedCommand } from '../hooks/use-guarded-command';
import { Dialog, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { TextField } from './ui/input';
import { Select } from './ui/select';
import { Checkbox, Notice, Badge, EmptyState, Table } from './ui/surfaces';
interface PersonnelDocument {
    id: string;
    staffId: string;
    title: string;
    category: string;
    expiresOn: string;
    originalName: string;
    actorId: string;
    archived: number;
    version: number;
    createdAt: string;
    sha256: string;
    sizeBytes: number;
    mediaType: string;
    scanStatus: 'not_scanned';
}
interface DocumentList {
    staff: {
        id: string;
        name: string;
        technician_id: string | null;
    };
    rows: PersonnelDocument[];
    total: number;
    page: number;
    pageSize: number;
}
interface History {
    rows: {
        id: number;
        action: string;
        actorId: string;
        reason: string;
        createdAt: string;
        before: unknown;
        after: unknown;
    }[];
    hasMore: boolean;
    page: number;
}
const categories = [{ value: 'employment', label: 'Employment' }, { value: 'certification', label: 'Certification' }, { value: 'training', label: 'Training' }, { value: 'license', label: 'License' }, { value: 'other', label: 'Other' }];
async function sendUpload(path: string, command: Record<string, unknown>): Promise<{
    document: PersonnelDocument;
}> {
    const form = new FormData();
    form.append('file', command.file as File);
    form.append('metadata', JSON.stringify(command.metadata));
    const response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'OpenFieldService' }, body: form });
    if (response.status === 401)
        window.dispatchEvent(new Event('ofs:auth-required'));
    let result;
    try {
        result = await response.json();
    }
    catch {
        throw new Error('The upload response was unreadable. Retry the exact upload to recover its outcome.');
    }
    if (!response.ok)
        throw new AccountRequestError(result.error || 'Personnel document upload failed.', response.status);
    return result;
}
function DocumentForm({ staffId, row, disabled, close, saved }: {
    staffId: string;
    row: PersonnelDocument | null;
    disabled: boolean;
    close(): void;
    saved(): void;
}) {
    const [file, setFile] = useState<File | null>(null), [title, setTitle] = useState(row?.title ?? ''), [category, setCategory] = useState(row?.category ?? 'other'), [expires, setExpires] = useState(row?.expiresOn ?? ''), [reason, setReason] = useState(''), [archived, setArchived] = useState(!!row?.archived), [history, setHistory] = useState<History | null>(null), [page, setPage] = useState(1), [historyError, setHistoryError] = useState('');
    const command = useGuardedCommand<Record<string, unknown>, {
        document: PersonnelDocument;
    }>(row ? `/api/hr-documents/records/${row.id}` : `/api/hr-documents/staff/${staffId}/upload`, saved, row ? undefined : sendUpload), locked = disabled || command.busy || command.uncertain;
    useEffect(() => { if (!row)
        return; let live = true; setHistoryError(''); void accountRequest<History>(`/api/hr-documents/records/${row.id}/history?page=${page}`).then(value => { if (live)
        setHistory(value); }).catch(e => { if (live)
        setHistoryError((e as Error).message); }); return () => { live = false; }; }, [row?.id, page]);
    function submit() {
        if (!title.trim() || reason.trim().length < 10) {
            command.setError('Enter a document title and a reason of at least 10 characters.');
            return;
        }
        const data = { requestKey: crypto.randomUUID(), title, category, expiresOn: expires, reason };
        if (!row) {
            if (!file || file.size === 0 || file.size > 10 * 1024 * 1024) {
                command.setError('Choose a nonempty file up to 10 MiB.');
                return;
            }
            void command.run({ file, metadata: { id: crypto.randomUUID(), ...data } });
        }
        else
            void command.run({ ...data, expectedVersion: row.version, archived });
    }
    return <Dialog class="bid-review-dialog personnel-document-form" close={() => { if (command.canClose())
        close(); }}><DialogTitle>{row ? 'Document details / archive' : 'Upload personnel document'}</DialogTitle><Notice>Private to HR and administrators. Linking a file to this technician does not share it through a job ticket or grant the technician access.</Notice>{command.error && <Notice tone="danger">{command.error}</Notice>}{command.uncertain && <Notice tone="warning">Outcome uncertain. Editing is locked; retry the exact upload or change before leaving.</Notice>}{!row && <TextField label="File" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" disabled={locked} onChange={e => { command.changed(); const value = e.currentTarget.files?.[0] ?? null; setFile(value); if (value && !title)
        setTitle(value.name.replace(/\.[^.]*$/, '')); }}/>}<TextField label="Document title" value={title} maxLength={160} disabled={locked} onInput={e => { command.changed(); setTitle(e.currentTarget.value); }}/><Select label="Category" value={category} disabled={locked} options={categories} onValueChange={v => { command.changed(); setCategory(v); }}/><TextField label="Expires on (optional)" type="date" value={expires} disabled={locked} onInput={e => { command.changed(); setExpires(e.currentTarget.value); }}/>{row && <Checkbox label="Archived (retain original file and history)" checked={archived} disabled={locked} onChange={e => { command.changed(); setArchived(e.currentTarget.checked); }}/>}<TextField label="Upload / metadata change reason" value={reason} maxLength={2000} disabled={locked} onInput={e => { command.changed(); setReason(e.currentTarget.value); }}/><p class="workspace-help">PDF, PNG, JPEG or WebP · up to 10 MiB · Not malware scanned. Expiry is recorded here; automated reminders and acknowledgments are separate work.</p><div class="staff-actions"><Button disabled={command.busy || command.uncertain} onClick={() => { if (command.canClose())
        close(); }}>Cancel</Button><Button variant="primary" disabled={disabled || command.busy || (!command.uncertain && (!title.trim() || reason.trim().length < 10 || (!row && !file)))} onClick={submit}>{command.uncertain ? 'Retry exact request' : row ? 'Save document details' : 'Upload to this person'}</Button></div>{row && <details class="sales-details"><summary>Retained document history</summary>{historyError && <Notice tone="warning">{historyError}</Notice>}{history?.rows.map(event => <article class="staff-history" key={event.id}><strong>{event.action.replaceAll('_', ' ')}</strong><small>{event.createdAt} UTC · {event.actorId}</small><p>{event.reason}</p><details><summary>Retained details</summary><pre>{JSON.stringify({ before: event.before, after: event.after }, null, 2)}</pre></details></article>)}<div class="staff-actions"><Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous history</Button><span>Page {page}</span><Button disabled={!history?.hasMore} onClick={() => setPage(p => p + 1)}>Next history</Button></div></details>}</Dialog>;
}
export function PersonnelDocumentsDialog({ staffId, name, close }: {
    staffId: string;
    name: string;
    close(): void;
}) {
    const { readOnly } = useConnectivity(), [data, setData] = useState<DocumentList | null>(null), [page, setPage] = useState(1), [archived, setArchived] = useState(false), [revision, setRevision] = useState(0), [error, setError] = useState(''), [editing, setEditing] = useState<PersonnelDocument | 'new' | null>(null), [notice, setNotice] = useState('');
    useEffect(() => { let live = true; setError(''); setData(null); void accountRequest<DocumentList>(`/api/hr-documents/staff/${staffId}?` + new URLSearchParams({ page: String(page), includeArchived: String(archived) })).then(value => { if (live)
        setData(value); }).catch(e => { if (live)
        setError((e as Error).message); }); return () => { live = false; }; }, [staffId, page, archived, revision]);
    return <Dialog class="staff-access-dialog personnel-documents-dialog" close={() => { if (!editing)
        close(); }}><DialogTitle>{name} · Personnel documents</DialogTitle><p class="workspace-help">Files are attached to this staff member’s native identity, including their technician record where linked.</p><div class="staff-actions"><Button disabled={!!editing} onClick={close}>Close</Button><Button disabled={!!editing} onClick={() => setRevision(r => r + 1)}>Refresh</Button><Button variant="primary" disabled={readOnly || !data || !!editing} onClick={() => setEditing('new')}>Upload document</Button><Checkbox label="Include archived" checked={archived} disabled={!!editing} onChange={e => { setArchived(e.currentTarget.checked); setPage(1); }}/></div>{error && <Notice tone="danger">{error}</Notice>}{notice && <Notice tone="success" close={() => setNotice('')}>{notice}</Notice>}{!data && !error && <p role="status">Loading personnel documents…</p>}{data && (data.rows.length ? <Table label="Person-linked personnel documents"><thead><tr><th>Document</th><th>Category / expiry</th><th>File</th><th>Actions</th></tr></thead><tbody>{data.rows.map(doc => <tr key={doc.id}><th scope="row">{doc.title}{!!doc.archived && <Badge>Archived</Badge>}</th><td>{categories.find(c => c.value === doc.category)?.label}<small>{doc.expiresOn ? 'Expires ' + doc.expiresOn : 'No expiry recorded'}</small></td><td>{doc.originalName}<small>{(doc.sizeBytes / 1024).toFixed(1)} KiB · Not scanned</small></td><td><div class="staff-actions"><a class="btn ui-button" href={`/api/hr-documents/records/${doc.id}/download`} download>Download original</a><Button onClick={() => setEditing(doc)}>Details / archive</Button></div></td></tr>)}</tbody></Table> : <EmptyState title="No documents in this view">Upload a personnel document for this staff member or include archived records.</EmptyState>)}{data && <div class="staff-actions"><Button disabled={page <= 1 || !!editing} onClick={() => setPage(p => p - 1)}>Previous</Button><span>{data.total} documents · Page {page}</span><Button disabled={page * 25 >= data.total || !!editing} onClick={() => setPage(p => p + 1)}>Next</Button></div>}{editing && <DocumentForm staffId={staffId} row={editing === 'new' ? null : editing} disabled={readOnly} close={() => setEditing(null)} saved={() => { setEditing(null); setNotice('Personnel document saved on this staff member.'); setRevision(r => r + 1); }}/>}</Dialog>;
}
