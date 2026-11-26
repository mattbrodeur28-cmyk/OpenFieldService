import { useEffect, useState } from 'preact/hooks';
import { accountRequest, useAccount, isAdministrator } from '../auth';
import { useConnectivity } from '../hooks/use-connectivity';
import { useGuardedCommand } from '../hooks/use-guarded-command';
import { Dialog, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { TextField } from './ui/input';
import { Select } from './ui/select';
import { Notice, Checkbox, Badge } from './ui/surfaces';
interface Authorization {
    id: string;
    agreementId: string;
    offerId: string;
    acceptanceEventId: string;
    snapshotHash: string;
    pdfHash: string;
    startsOn: string;
    endsOn: string;
    timeZone: string;
    authorizedOn: string;
    authorizedAt: string;
    actorId: string;
    reason: string;
}
interface Summary {
    activation: Authorization | null;
    cancellation: {
        id: string;
        effectiveOn: string;
        actorId: string;
        reason: string;
        recordedAt: string;
    } | null;
    state: string;
    companyDate: string;
    sourceToken: string;
    canAuthorize: boolean;
    blockers: string[];
    acceptedOffer: {
        id: string;
        version: number;
        snapshotHash: string;
        pdfHash: string;
        acceptanceSequence: number;
        documentId: string;
        startsOn: string;
        endsOn: string;
    } | null;
}
interface ScopeCheck {
    date: string;
    decision: string;
    scopeEligible: boolean;
    billingEntitlement: false;
    includedVisits: null;
    includedHours: null;
    responsePriority: null;
    observedAt: string;
}
const labels: Record<string, string> = { not_authorized: 'Not authorized', not_authorized_yet: 'Before authorization', scheduled: 'Scheduled term', active: 'Active operational term', expired: 'Term ended', cancelled: 'Cancelled', outside_equipment_scope: 'Outside selected equipment scope', ownership_changed: 'Equipment location / ownership changed', equipment_retired: 'Equipment retired', scope_eligible: 'In accepted equipment scope' };
function AuthorizationCommand({ id, data, cancel, close, saved }: {
    id: string;
    data: Summary;
    cancel: boolean;
    close(): void;
    saved(): void;
}) {
    const { readOnly } = useConnectivity(), [effectiveOn, setEffectiveOn] = useState(data.companyDate), [reason, setReason] = useState(''), [attested, setAttested] = useState(false), command = useGuardedCommand<Record<string, unknown>, unknown>(`/api/agreements/${id}/activation/${cancel ? 'cancel' : 'authorize'}`, saved), locked = readOnly || command.busy || command.uncertain;
    function submit() {
        if (reason.trim().length < 10 || !attested) {
            command.setError('Review this operational decision and enter a reason of at least 10 characters.');
            return;
        }
        const base = { id: crypto.randomUUID(), requestKey: crypto.randomUUID(), reason, reviewAttested: true };
        if (cancel) {
            if (!data.activation)
                return;
            void command.run({ ...base, activationId: data.activation.id, expectedSourceToken: data.sourceToken, effectiveOn });
        }
        else {
            if (!data.acceptedOffer)
                return;
            const source = data.acceptedOffer;
            void command.run({ ...base, offerId: source.id, expectedAcceptanceSequence: source.acceptanceSequence, expectedSnapshotHash: source.snapshotHash, expectedPdfHash: source.pdfHash });
        }
    }
    return <Dialog class="bid-review-dialog agreement-form" close={() => {
            if (command.canClose())
                close();
        }}><DialogTitle>{cancel ? 'Cancel operational authorization' : 'Authorize accepted operational term'}</DialogTitle><Notice>{cancel ? 'Record a cancellation effective today or later. It retains accepted evidence and does not cancel Jobs, send refunds, change invoices or notify the customer.' : 'Authorize only the exact accepted scope and PDF. Future-start terms remain scheduled. This does not verify signatures, approve free billing or generate maintenance Jobs.'}</Notice>{command.error && <Notice tone="danger">{command.error}</Notice>}{command.uncertain && <Notice tone="warning">Outcome uncertain. Retry the exact command before leaving.</Notice>}<p>Accepted term: {data.acceptedOffer?.startsOn} → {data.acceptedOffer?.endsOn}</p>{cancel && <TextField label="Cancellation effective date" type="date" value={effectiveOn} min={data.companyDate} max={data.activation?.endsOn} disabled={locked} onInput={e => { command.changed(); setEffectiveOn(e.currentTarget.value); }}/>}<TextField label="Operational decision reason" value={reason} maxLength={2000} disabled={locked} onInput={e => { command.changed(); setReason(e.currentTarget.value); }}/><Checkbox label={cancel ? 'I reviewed this effective date and will handle existing work/billing separately.' : 'I reviewed the recorded acceptance, exact offered PDF, current equipment ownership and accepted term.'} checked={attested} disabled={locked} onChange={e => { command.changed(); setAttested(e.currentTarget.checked); }}/><div class="agreement-actions"><Button disabled={command.busy || command.uncertain} onClick={() => {
            if (command.canClose())
                close();
        }}>Cancel</Button><Button variant="primary" disabled={readOnly || command.busy} onClick={submit}>{command.uncertain ? 'Retry exact command' : cancel ? 'Retain cancellation' : 'Authorize accepted term'}</Button></div></Dialog>;
}
export function AgreementActivation({ id, version, assets, changed }: {
    id: string;
    version: number;
    assets: {
        id: string;
        name: string;
    }[];
    changed(): void;
}) {
    const { user } = useAccount(), { readOnly } = useConnectivity(), [data, setData] = useState<Summary | null>(null), [error, setError] = useState(''), [revision, setRevision] = useState(0), [command, setCommand] = useState<'authorize' | 'cancel' | null>(null), [assetId, setAssetId] = useState(''), [date, setDate] = useState(''), [scope, setScope] = useState<ScopeCheck | null>(null), [checking, setChecking] = useState(false), [checkError, setCheckError] = useState('');
    useEffect(() => {
        let live = true;
        setData(null);
        setError('');
        setScope(null);
        void accountRequest<Summary>(`/api/agreements/${id}/activation`).then(value => {
            if (live) {
                setData(value);
                setDate(value.companyDate);
            }
        }).catch(e => {
            if (live)
                setError((e as Error).message);
        });
        return () => { live = false; };
    }, [id, version, revision]);
    async function check() {
        if (!assetId)
            return;
        setChecking(true);
        setCheckError('');
        setScope(null);
        try {
            setScope(await accountRequest<ScopeCheck>(`/api/agreements/${id}/coverage?` + new URLSearchParams({ assetId, ...(date ? { date } : {}) })));
        }
        catch (e) {
            setCheckError((e as Error).message);
        }
        finally {
            setChecking(false);
        }
    }
    return <section class="detail-section"><header class="agreement-actions"><h3>Operational authorization</h3><Button disabled={!!command} onClick={() => setRevision(r => r + 1)}>Refresh authorization</Button></header>{error && <Notice tone="warning">{error}</Notice>}{!data && !error && <p role="status">Loading authorization…</p>}{data && <><Badge>{labels[data.state] || data.state}</Badge>{data.activation ? <><p>Accepted term {data.activation.startsOn} → {data.activation.endsOn} · Authorized on {data.activation.authorizedOn}</p>{data.cancellation && <Notice tone="warning">Cancellation effective {data.cancellation.effectiveOn}. {data.cancellation.reason}</Notice>}<details><summary>Retained operational authorization</summary><p class="agreement-text">{data.activation.reason}</p><small>Actor {data.activation.actorId} · {data.activation.authorizedAt}</small><p class="agreement-text">Accepted snapshot SHA-256 {data.activation.snapshotHash}</p><p class="agreement-text">PDF SHA-256 {data.activation.pdfHash}</p></details></> : <>{data.blockers.map(blocker => <p class="workspace-help" key={blocker}>{blocker}</p>)}</>}{isAdministrator(user) && <div class="agreement-actions">{!data.activation ? <Button variant="primary" disabled={readOnly || !data.canAuthorize} onClick={() => setCommand('authorize')}>Authorize accepted term</Button> : <Button disabled={readOnly || !!data.cancellation || data.companyDate > data.activation.endsOn} onClick={() => setCommand('cancel')}>Record operational cancellation</Button>}</div>}<p class="workspace-help">Authorization and scope eligibility do not determine included visits, hours, response priority or billable exceptions. No invoice, refund, automatic renewal or maintenance Job is created here.</p><details><summary>Check selected equipment scope</summary>{assets.length ? <><Select label="Equipment from this accepted scope" value={assetId} placeholder="Choose equipment" options={assets.map(asset => ({ value: asset.id, label: asset.name }))} disabled={checking} onValueChange={value => { setAssetId(value); setScope(null); }}/><TextField label="Scope date" type="date" value={date} disabled={checking} onInput={e => { setDate(e.currentTarget.value); setScope(null); }}/><Button disabled={!assetId || checking} onClick={() => void check()}>{checking ? 'Checking native scope…' : 'Check equipment scope'}</Button>{checkError && <Notice tone="warning">{checkError}</Notice>}{scope && <Notice tone={scope.scopeEligible ? 'success' : 'warning'}>{labels[scope.decision] || scope.decision} · {scope.date}. This checks the accepted term against current native equipment ownership; it does not approve no-charge work.</Notice>}</> : <p>No equipment was explicitly selected in this revision. Location selection does not imply whole-building equipment coverage.</p>}</details>{command && <AuthorizationCommand id={id} data={data} cancel={command === 'cancel'} close={() => setCommand(null)} saved={() => { setCommand(null); changed(); }}/>}</>}</section>;
}
