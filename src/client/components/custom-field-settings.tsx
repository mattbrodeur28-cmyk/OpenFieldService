import { useEffect, useState } from 'preact/hooks';
import { accountRequest, useAccount, isAdministrator } from '../auth';
import { useConnectivity } from '../hooks/use-connectivity';
import { useGuardedCommand } from '../hooks/use-guarded-command';
import { Dialog, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { TextField } from './ui/input';
import { Select } from './ui/select';
import { Notice, Checkbox, Badge, Table } from './ui/surfaces';
import './custom-field-settings.css';
export interface CustomFieldDefinition {
    id: string;
    objectKey: string;
    key: string;
    label: string;
    description: string;
    type: string;
    options: {
        key: string;
        label: string;
        active: boolean;
    }[];
    active: boolean;
    version: number;
}
const objects = [{ value: 'crm.customer', label: 'Customers' }, { value: 'equipment.asset', label: 'Equipment' }, { value: 'sales.opportunity', label: 'Sales opportunities' }, { value: 'service.job', label: 'Jobs / Work Orders' }];
const types = [{ value: 'text', label: 'Text' }, { value: 'integer', label: 'Whole number' }, { value: 'boolean', label: 'Yes / No' }, { value: 'date', label: 'Date' }, { value: 'select', label: 'Choice' }];
interface FieldHistory {
    rows: {
        version: number;
        actorId: string;
        reason: string;
        createdAt: string;
        definition: CustomFieldDefinition;
    }[];
    hasMore: boolean;
}
function DefinitionForm({ objectKey, field, close, saved }: {
    objectKey: string;
    field: CustomFieldDefinition | null;
    close(): void;
    saved(): void;
}) {
    const { readOnly } = useConnectivity();
    const [id] = useState(() => field?.id ?? crypto.randomUUID()), [key, setKey] = useState(field?.key ?? 'custom_'), [label, setLabel] = useState(field?.label ?? ''), [description, setDescription] = useState(field?.description ?? ''), [type, setType] = useState(field?.type ?? 'text'), [options, setOptions] = useState(() => field?.options.map(o => ({ ...o })) ?? []), [active, setActive] = useState(field?.active ?? true), [reason, setReason] = useState(''), [history, setHistory] = useState<FieldHistory | null>(null), [page, setPage] = useState(1), [historyError, setHistoryError] = useState('');
    const command = useGuardedCommand<Record<string, unknown>, {
        field: CustomFieldDefinition;
    }>('/api/platform/fields', saved), locked = readOnly || command.busy || command.uncertain;
    useEffect(() => { if (!field)
        return; let live = true; setHistory(null); setHistoryError(''); void accountRequest<FieldHistory>(`/api/platform/fields/${field.id}/history?page=${page}`).then(value => { if (live)
        setHistory(value); }).catch(e => { if (live)
        setHistoryError((e as Error).message); }); return () => { live = false; }; }, [field?.id, page]);
    function option(index: number, patch: Partial<CustomFieldDefinition['options'][number]>) { command.changed(); setOptions(old => old.map((o, i) => i === index ? { ...o, ...patch } : o)); }
    function submit() { if (!label.trim() || reason.trim().length < 10) {
        command.setError('Enter a label and a change reason of at least 10 characters.');
        return;
    } void command.run({ id, requestKey: crypto.randomUUID(), expectedVersion: field?.version ?? 0, objectKey, key, label, description, type, options, active, reason }); }
    return <Dialog class="bid-review-dialog custom-field-dialog" close={() => { if (command.canClose())
        close(); }}><DialogTitle>{field ? 'Review custom field' : 'Create custom field'}</DialogTitle><Notice>Optional administrator-only annotations on native {objects.find(o => o.value === objectKey)?.label.toLowerCase()}. They do not change pricing, taxes, permissions or required job steps.</Notice>{command.error && <Notice tone="danger">{command.error}</Notice>}{command.uncertain && <Notice tone="warning">Outcome uncertain. Retry the exact command before leaving.</Notice>}<TextField label="Field key" value={key} maxLength={50} disabled={locked || !!field} hint="Start with custom_ followed by a lowercase letter. Keys stay fixed after creation." onInput={e => { command.changed(); setKey(e.currentTarget.value); }}/><TextField label="Display label" value={label} maxLength={100} disabled={locked} onInput={e => { command.changed(); setLabel(e.currentTarget.value); }}/><TextField label="Description" value={description} maxLength={1000} disabled={locked} onInput={e => { command.changed(); setDescription(e.currentTarget.value); }}/><Select label="Value type" value={type} options={types} disabled={locked || !!field} onValueChange={v => { command.changed(); setType(v); setOptions([]); }}/>{type === 'select' && <section><h3>Choices</h3><p class="workspace-help">Keys remain fixed after saving. Deactivate a choice to retain its historical values.</p>{options.map((o, index) => <div class="custom-field-choice" key={index}><TextField label="Choice key" value={o.key} disabled={locked || !!field?.options.some(existing => existing.key === o.key)} maxLength={40} onInput={e => option(index, { key: e.currentTarget.value })}/><TextField label="Choice label" value={o.label} disabled={locked} maxLength={100} onInput={e => option(index, { label: e.currentTarget.value })}/><Checkbox label="Active choice" checked={o.active} disabled={locked} onChange={e => option(index, { active: e.currentTarget.checked })}/>{!field?.options.some(existing => existing.key === o.key) && <Button disabled={locked} onClick={() => { command.changed(); setOptions(old => old.filter((_, i) => i !== index)); }}>Remove unsaved choice</Button>}</div>)}<Button disabled={locked || options.length >= 50} onClick={() => { command.changed(); setOptions(old => [...old, { key: '', label: '', active: true }]); }}>Add choice</Button></section>}<Checkbox label="Active field (uncheck to archive without deleting values)" checked={active} disabled={locked} onChange={e => { command.changed(); setActive(e.currentTarget.checked); }}/><TextField label="Change reason" value={reason} maxLength={2000} disabled={locked} onInput={e => { command.changed(); setReason(e.currentTarget.value); }}/><div class="custom-field-actions"><Button disabled={command.busy || command.uncertain} onClick={() => { if (command.canClose())
        close(); }}>Cancel</Button><Button variant="primary" disabled={readOnly || command.busy} onClick={submit}>{command.uncertain ? 'Retry exact command' : 'Save reviewed definition'}</Button></div>{field && <details><summary>Retained definition history</summary>{historyError && <Notice tone="warning">{historyError}</Notice>}{history?.rows.map(row => <article class="custom-field-history" key={row.version}><strong>Version {row.version} · {row.definition.label}</strong><small>{row.createdAt} UTC · {row.actorId}</small><p>{row.reason}</p><details><summary>Definition at this version</summary><pre>{JSON.stringify(row.definition, null, 2)}</pre></details></article>)}<div class="custom-field-actions"><Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Newer</Button><span>Page {page}</span><Button disabled={!history?.hasMore} onClick={() => setPage(p => p + 1)}>Older</Button></div></details>}</Dialog>;
}
export function CustomFieldSettings() {
    const { user } = useAccount(), { readOnly } = useConnectivity(), [object, setObject] = useState('crm.customer'), [archived, setArchived] = useState(false), [fields, setFields] = useState<CustomFieldDefinition[] | null>(null), [error, setError] = useState(''), [revision, setRevision] = useState(0), [editing, setEditing] = useState<CustomFieldDefinition | 'new' | null>(null), [notice, setNotice] = useState('');
    useEffect(() => { if (!isAdministrator(user))
        return; let live = true; setFields(null); setError(''); void accountRequest<{
        fields: CustomFieldDefinition[];
    }>(`/api/platform/objects/${object}/fields?includeArchived=${archived}`).then(value => { if (live)
        setFields(value.fields); }).catch(e => { if (live)
        setError((e as Error).message); }); return () => { live = false; }; }, [object, archived, revision, user?.id, user?.role]);
    if (!isAdministrator(user))
        return null;
    return <section class="settings-card custom-field-settings"><h3>Custom fields</h3><p>Add optional typed annotations to existing business records. Owner/Admin access only; native record identity and business rules stay with their owning app.</p><div class="custom-field-actions"><Select label="Record type" value={object} options={objects} onValueChange={setObject}/><Checkbox label="Include archived" checked={archived} onChange={e => setArchived(e.currentTarget.checked)}/><Button disabled={readOnly || fields === null} onClick={() => setEditing('new')}>Create field</Button><Button onClick={() => setRevision(r => r + 1)}>Refresh</Button></div>{error && <Notice tone="danger">{error}</Notice>}{notice && <Notice tone="success" close={() => setNotice('')}>{notice}</Notice>}{fields === null && !error && <p role="status">Loading field definitions…</p>}{fields && (fields.length ? <Table label="Custom field definitions"><thead><tr><th>Field</th><th>Type / status</th><th>Review</th></tr></thead><tbody>{fields.map(field => <tr key={field.id}><th scope="row">{field.label}<small>{field.key}</small></th><td>{types.find(t => t.value === field.type)?.label} <Badge>{field.active ? 'Active' : 'Archived'}</Badge></td><td><Button onClick={() => setEditing(field)}>Review / edit</Button></td></tr>)}</tbody></Table> : <p class="workspace-help">No field definitions in this view.</p>)}<p class="workspace-help">Up to 100 fields per record type, including archived definitions. These optional annotations are not custom objects or generated workflows.</p>{editing && <DefinitionForm objectKey={object} field={editing === 'new' ? null : editing} close={() => setEditing(null)} saved={() => { setEditing(null); setNotice('Field definition saved with retained history.'); setRevision(r => r + 1); }}/>}</section>;
}
