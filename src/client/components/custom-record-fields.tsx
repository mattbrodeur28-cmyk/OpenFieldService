import { useEffect, useState } from 'preact/hooks';
import { accountRequest, useAccount, isAdministrator } from '../auth';
import { useConnectivity } from '../hooks/use-connectivity';
import { useGuardedCommand } from '../hooks/use-guarded-command';
import type { CustomFieldDefinition } from './custom-field-settings';
import { Dialog, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { TextField } from './ui/input';
import { Select } from './ui/select';
import { Notice, Checkbox, Badge } from './ui/surfaces';
import './custom-field-settings.css';
type Value = string | number | boolean | null;
interface RecordFields {
    objectKey: string;
    recordId: string;
    label: string;
    version: number;
    fields: CustomFieldDefinition[];
    values: {
        fieldId: string;
        fieldVersion: number;
        value: Value;
    }[];
    scope: string;
}
interface RecordHistory {
    rows: {
        id: string;
        version: number;
        actorId: string;
        reason: string;
        createdAt: string;
        changes: unknown[];
    }[];
    hasMore: boolean;
}
const initial = (data: RecordFields) => Object.fromEntries(data.fields.map(f => [f.id, data.values.find(v => v.fieldId === f.id)?.value ?? null]));
function ValueEditor({ data, close, saved, notice }: {
    data: RecordFields;
    close(): void;
    saved(data: RecordFields): void;
    notice: string;
}) {
    const { readOnly } = useConnectivity(), [values, setValues] = useState<Record<string, Value>>(() => initial(data)), [reason, setReason] = useState(''), [history, setHistory] = useState<RecordHistory | null>(null), [page, setPage] = useState(1), [historyError, setHistoryError] = useState('');
    const path = `/api/platform/objects/${data.objectKey}/records/${data.recordId}/fields`;
    const command = useGuardedCommand<Record<string, unknown>, {
        record: RecordFields;
    }>(path, r => saved(r.record)), locked = readOnly || command.busy || command.uncertain;
    const before = initial(data), changed = data.fields.filter(f => f.active && values[f.id] !== before[f.id]);
    useEffect(() => { let live = true; setHistory(null); setHistoryError(''); void accountRequest<RecordHistory>(`/api/platform/objects/${data.objectKey}/records/${data.recordId}/field-history?page=${page}`).then(value => { if (live)
        setHistory(value); }).catch(e => { if (live)
        setHistoryError((e as Error).message); }); return () => { live = false; }; }, [data.objectKey, data.recordId, page]);
    function update(id: string, value: Value) { command.changed(); setValues(old => ({ ...old, [id]: value })); }
    function submit() {
        if (reason.trim().length < 10 || !changed.length) {
            command.setError('Change at least one field and enter a reason of at least 10 characters.');
            return;
        }
        try {
            const changes = changed.map(f => { const raw = values[f.id]; let value: Value = raw; if (f.type === 'integer' && raw !== null) {
                if (!/^-?\d+$/.test(String(raw)) || !Number.isSafeInteger(Number(raw)))
                    throw new Error(f.label + ': enter a safe whole number.');
                value = Number(raw);
            } return { fieldId: f.id, fieldVersion: f.version, value }; });
            void command.run({ id: crypto.randomUUID(), requestKey: crypto.randomUUID(), expectedVersion: data.version, changes, reason });
        }
        catch (e) {
            command.setError((e as Error).message);
        }
    }
    return <Dialog class="bid-review-dialog custom-field-dialog" close={() => { if (command.canClose())
        close(); }}><DialogTitle>{data.label} · Custom fields</DialogTitle>{notice && <Notice tone="success">{notice}</Notice>}<Notice>Administrator-only annotations on this native record. These values do not alter pricing, taxes, accepted scope or required job steps.</Notice>{command.error && <Notice tone="danger">{command.error}</Notice>}{command.uncertain && <Notice tone="warning">Outcome uncertain. Edits are frozen; retry the exact request before leaving.</Notice>}{data.fields.map(field => { const value = values[field.id], empty = value === null, disabled = locked || !field.active; return <section class="custom-record-value" key={field.id}><h3>{field.label} {!field.active && <Badge>Archived</Badge>}</h3><p class="workspace-help">{field.description || field.key}</p>{field.active ? <><Checkbox label="No value / clear stored value" checked={empty} disabled={disabled} onChange={e => update(field.id, e.currentTarget.checked ? null : field.type === 'boolean' ? false : field.type === 'integer' ? 0 : '')}/>{!empty && (field.type === 'boolean' ? <Select label={field.label} value={value === true ? 'yes' : 'no'} disabled={disabled} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} onValueChange={v => update(field.id, v === 'yes')}/> : field.type === 'select' ? <Select label={field.label} value={String(value)} disabled={disabled} options={[{ value: '', label: 'Choose an active option', disabled: true }, ...field.options.filter(o => o.active || o.key === value).map(o => ({ value: o.key, label: o.label + (o.active ? '' : ' (inactive; select a current choice)'), disabled: !o.active }))]} onValueChange={v => update(field.id, v)}/> : <TextField label={field.label} type={field.type === 'date' ? 'date' : 'text'} inputMode={field.type === 'integer' ? 'numeric' : 'text'} value={String(value)} maxLength={field.type === 'text' ? 2000 : 40} disabled={disabled} onInput={e => update(field.id, e.currentTarget.value)}/>)}</> : <p>{empty ? 'No value' : typeof value === 'boolean' ? value ? 'Yes' : 'No' : field.type === 'select' ? field.options.find(o => o.key === value)?.label ?? String(value) : String(value)}</p>}{data.values.some(v => v.fieldId === field.id) && <small class="workspace-help">Stored definition version {data.values.find(v => v.fieldId === field.id)?.fieldVersion} · current version {field.version}</small>}</section>; })}{!data.fields.length && <p>No custom fields defined for this record type. Configure definitions in Settings → Custom fields.</p>}<TextField label="Value change reason" value={reason} maxLength={2000} disabled={locked} onInput={e => { command.changed(); setReason(e.currentTarget.value); }}/><div class="custom-field-actions"><Button disabled={command.busy || command.uncertain} onClick={() => { if (command.canClose())
        close(); }}>Close</Button><Button variant="primary" disabled={readOnly || command.busy || (!command.uncertain && (!changed.length || reason.trim().length < 10))} onClick={submit}>{command.uncertain ? 'Retry exact request' : `Save ${changed.length} changed field${changed.length === 1 ? '' : 's'}`}</Button></div><details><summary>Retained value history</summary>{historyError && <Notice tone="warning">{historyError}</Notice>}{history?.rows.map(event => <article class="custom-field-history" key={event.id}><strong>Record version {event.version}</strong><small>{event.createdAt} UTC · {event.actorId}</small><p>{event.reason}</p><details><summary>Retained before / after values</summary><pre>{JSON.stringify(event.changes, null, 2)}</pre></details></article>)}<div class="custom-field-actions"><Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Newer</Button><span>Page {page}</span><Button disabled={!history?.hasMore} onClick={() => setPage(p => p + 1)}>Older</Button></div></details></Dialog>;
}
function RecordDialog({ objectKey, recordId, close }: {
    objectKey: string;
    recordId: string;
    close(): void;
}) {
    const [data, setData] = useState<RecordFields | null>(null), [error, setError] = useState(''), [revision, setRevision] = useState(0), [notice, setNotice] = useState('');
    useEffect(() => { let live = true; setData(null); setError(''); void accountRequest<RecordFields>(`/api/platform/objects/${objectKey}/records/${recordId}/fields`).then(value => { if (live)
        setData(value); }).catch(e => { if (live)
        setError((e as Error).message); }); return () => { live = false; }; }, [objectKey, recordId, revision]);
    if (data)
        return <><ValueEditor key={data.version} data={data} close={close} notice={notice} saved={next => { setData(next); setNotice('Custom values saved with retained history.'); }}/></>;
    return <Dialog class="bid-review-dialog custom-field-dialog" close={close}><DialogTitle>Custom record fields</DialogTitle>{error ? <Notice tone="danger">{error}</Notice> : <p role="status">Loading native record fields…</p>}<div class="custom-field-actions"><Button onClick={close}>Close</Button>{error && <Button onClick={() => setRevision(r => r + 1)}>Retry load</Button>}</div></Dialog>;
}
export function CustomRecordFields({ objectKey, recordId }: {
    objectKey: string;
    recordId: string;
}) {
    const { user } = useAccount(), [open, setOpen] = useState(false);
    if (!isAdministrator(user))
        return null;
    return <section class="custom-record-panel"><Button onClick={() => setOpen(true)}>Custom fields</Button><small class="workspace-help">Administrator annotations</small>{open && <RecordDialog key={objectKey + recordId} objectKey={objectKey} recordId={recordId} close={() => setOpen(false)}/>}</section>;
}
