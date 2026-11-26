import { useState } from 'preact/hooks';
import { accountRequest, AccountRequestError, useAccount, isAdministrator } from '../auth';
import { useConnectivity } from '../hooks/use-connectivity';
import { useGuardedCommand } from '../hooks/use-guarded-command';
import { Dialog, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { TextField } from './ui/input';
import { Notice, Checkbox } from './ui/surfaces';
export interface ProposedAgreementDocument {
    id: string;
    agreementId: string;
    version: number;
    title: string;
    originalName: string;
    sha256: string;
    sizeBytes: number;
    actorId: string;
    createdAt: string;
    scanStatus: 'not_scanned';
}
async function send(path: string, command: Record<string, unknown>) { const form = new FormData(); form.append('file', command.file as File); form.append('metadata', JSON.stringify(command.metadata)); const response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'OpenFieldService' }, body: form }); if (response.status === 401)
    window.dispatchEvent(new Event('ofs:auth-required')); let result; try {
    result = await response.json();
}
catch {
    throw new Error('Upload response unreadable. Retry the exact request to recover its outcome.');
} if (!response.ok)
    throw new AccountRequestError(result.error || 'Proposed PDF upload failed.', response.status); return result; }
function Upload({ id, version, close, saved }: {
    id: string;
    version: number;
    close(): void;
    saved(): void;
}) {
    const { readOnly } = useConnectivity(), [file, setFile] = useState<File | null>(null), [title, setTitle] = useState('Proposed contract revision ' + version), [reason, setReason] = useState(''), [attested, setAttested] = useState(false), command = useGuardedCommand<Record<string, unknown>, unknown>(`/api/agreements/${id}/proposed-document/upload`, saved, send), locked = readOnly || command.busy || command.uncertain;
    function submit() { if (!file || file.size === 0 || file.size > 10 * 1024 * 1024 || !title.trim() || reason.trim().length < 10 || !attested) {
        command.setError('Choose a PDF up to 10 MiB, enter a title/reason and confirm its exact revision.');
        return;
    } void command.run({ file, metadata: { id: crypto.randomUUID(), requestKey: crypto.randomUUID(), expectedVersion: version, title, reason, reviewAttested: true } }); }
    return <Dialog class="bid-review-dialog agreement-form" close={() => { if (command.canClose())
        close(); }}><DialogTitle>Attach proposed PDF · revision {version}</DialogTitle><Notice>One immutable proposed PDF per revision. To replace it, save a new draft revision. This is not proof of customer acceptance or a verified signature.</Notice>{command.error && <Notice tone="danger">{command.error}</Notice>}{command.uncertain && <Notice tone="warning">Outcome uncertain. Retry the exact upload before leaving.</Notice>}<TextField label="Proposed contract PDF" type="file" accept=".pdf,application/pdf" disabled={locked} onChange={e => { command.changed(); setFile(e.currentTarget.files?.[0] ?? null); }}/><TextField label="Document title" value={title} maxLength={160} disabled={locked} onInput={e => { command.changed(); setTitle(e.currentTarget.value); }}/><TextField label="Attachment reason" value={reason} maxLength={2000} disabled={locked} onInput={e => { command.changed(); setReason(e.currentTarget.value); }}/><Checkbox label="I reviewed this PDF against the current draft revision and proposed scope." checked={attested} disabled={locked} onChange={e => { command.changed(); setAttested(e.currentTarget.checked); }}/><p class="workspace-help">PDF signature identification only; no malware scanning or legal/signature verification. Attach before submitting for review.</p><div class="agreement-actions"><Button disabled={command.busy || command.uncertain} onClick={() => { if (command.canClose())
        close(); }}>Cancel</Button><Button variant="primary" disabled={readOnly || command.busy} onClick={submit}>{command.uncertain ? 'Retry exact upload' : 'Retain proposed PDF'}</Button></div></Dialog>;
}
export function AgreementDocument({ id, version, archived, reviewStatus, document, saved }: {
    id: string;
    version: number;
    archived: boolean;
    reviewStatus?: string;
    document?: ProposedAgreementDocument | null;
    saved(): void;
}) {
    const { user } = useAccount(), { readOnly } = useConnectivity(), [upload, setUpload] = useState(false);
    if (document === undefined)
        return <Notice>Proposed PDF storage is unavailable on this backend. Reload after the backend update.</Notice>;
    return <section class="detail-section"><h3>Proposed contract PDF</h3>{document ? <><p>{document.title} · {document.originalName} · {(document.sizeBytes / 1024).toFixed(1)} KiB</p><p class="workspace-help">Retained for revision {document.version} · Not malware scanned</p><a class="btn ui-button" href={`/api/agreements/documents/${document.id}/download`} download>Download original PDF</a><details><summary>Original document identity</summary><p class="agreement-text">SHA-256 {document.sha256}</p><p>Recorded {document.createdAt} · Actor {document.actorId}</p></details></> : <><p>No proposed PDF retained for this revision. Older revision documents are not automatically carried forward.</p>{isAdministrator(user) && <Button disabled={readOnly || archived || !reviewStatus || ['submitted', 'approved'].includes(reviewStatus)} onClick={() => setUpload(true)}>Attach proposed PDF</Button>}{['submitted', 'approved'].includes(reviewStatus ?? '') && <p class="workspace-help">Withdraw the current internal review before attaching a PDF.</p>}</>}<p class="workspace-help">Proposed source only; this does not record customer acceptance or activate coverage.</p>{upload && <Upload id={id} version={version} close={() => setUpload(false)} saved={() => { setUpload(false); saved(); }}/>}</section>;
}
export function HistoricalAgreementDocument({ id, version }: {
    id: string;
    version: number;
}) { const [value, setValue] = useState<ProposedAgreementDocument | null | undefined>(undefined), [busy, setBusy] = useState(false), [error, setError] = useState(''); async function load() { setBusy(true); setError(''); try {
    const result = await accountRequest<{
        document: ProposedAgreementDocument | null;
    }>(`/api/agreements/${id}/proposed-document?version=${version}`);
    setValue(result.document);
}
catch (e) {
    setError((e as Error).message);
}
finally {
    setBusy(false);
} } return <section>{value === undefined && <Button disabled={busy} onClick={() => void load()}>{busy ? 'Loading PDF identity…' : 'Find this revision’s retained PDF'}</Button>}{error && <Notice tone="warning">{error}</Notice>}{value === null && <p class="workspace-help">No PDF was retained for this revision.</p>}{value && <><a class="btn ui-button" href={`/api/agreements/documents/${value.id}/download`} download>Download revision {version} PDF</a><small class="agreement-text">SHA-256 {value.sha256} · Not malware scanned</small></>}</section>; }
