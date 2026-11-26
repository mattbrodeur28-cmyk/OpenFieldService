import { useEffect, useState } from 'preact/hooks';
import { accountRequest, useAccount, isAdministrator } from '../auth';
import { useConnectivity } from '../hooks/use-connectivity';
import { useCompanyTimeZone } from '../hooks/use-company-timezone';
import { useGuardedCommand } from '../hooks/use-guarded-command';
import { localInput, resolveLocal, formatTimestamp } from '../time-format';
import { Dialog, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { TextField } from './ui/input';
import { Select } from './ui/select';
import { Notice, Checkbox, Badge } from './ui/surfaces';
interface Offer {
    id: string;
    version: number;
    state: string;
    sequence: number;
    documentId: string;
    snapshotHash: string;
    pdfHash: string;
    validUntil: string;
    offeredAt: string;
    recipient: {
        name: string;
        email: string;
    };
    snapshot: {
        issuer: {
            legalName: string;
        };
        source: {
            document: {
                title: string;
            };
        };
    };
}
interface Summary {
    agreementId: string;
    version: number;
    reviewSequence: number;
    sourceHash: string;
    issuer: {
        version: number;
        legalName: string;
    } | null;
    proposedDocument: {
        id: string;
    } | null;
    offer: Offer | null;
    canOffer: boolean;
    blockers: string[];
    companyDate: string;
}
interface History {
    rows: {
        id: string;
        offerId: string;
        version: number;
        sequence: number;
        action: string;
        actorId: string;
        reason: string;
        recordedAt: string;
        evidence: unknown;
    }[];
    hasMore: boolean;
}
const labels: Record<string, string> = { offer: 'Freeze offer', delivered: 'Record external delivery', accepted: 'Record customer acceptance', declined: 'Record customer decline', withdrawn: 'Withdraw offer', expired: 'Record expiry' };
const stateLabels: Record<string, string> = { offer: 'Offered', delivered: 'Delivery recorded', accepted: 'Acceptance recorded', declined: 'Declined', withdrawn: 'Withdrawn', expired: 'Expired' };
function LifecycleCommand({ id, summary, action, customerName, close, saved }: {
    id: string;
    summary: Summary;
    action: string;
    customerName: string;
    close(): void;
    saved(): void;
}) {
    const { readOnly } = useConnectivity(), company = useCompanyTimeZone(), [name, setName] = useState(summary.offer?.recipient.name ?? customerName), [email, setEmail] = useState(summary.offer?.recipient.email ?? ''), [validUntil, setValidUntil] = useState(summary.companyDate), [occurred, setOccurred] = useState(''), [method, setMethod] = useState('email'), [reference, setReference] = useState(''), [capacity, setCapacity] = useState(''), [authority, setAuthority] = useState(''), [reason, setReason] = useState(''), [attested, setAttested] = useState(false);
    const command = useGuardedCommand<Record<string, unknown>, unknown>(`/api/agreements/${id}/lifecycle/${action === 'offer' ? 'offer' : 'response'}`, saved), locked = readOnly || command.busy || command.uncertain, evidence = ['delivered', 'accepted', 'declined'].includes(action), response = ['accepted', 'declined'].includes(action);
    useEffect(() => { if (company.timeZone && !occurred)
        setOccurred(localInput(new Date().toISOString(), company.timeZone)); }, [company.timeZone]);
    function submit() { if (reason.trim().length < 10 || !attested) {
        command.setError('Review the exact source and enter a reason of at least 10 characters.');
        return;
    } try {
        const base = { id: crypto.randomUUID(), requestKey: crypto.randomUUID(), reason };
        if (action === 'offer') {
            if (!summary.issuer)
                throw new Error('Configure the reviewed issuer first.');
            void command.run({ ...base, expectedVersion: summary.version, expectedReviewSequence: summary.reviewSequence, expectedIssuerVersion: summary.issuer.version, expectedSourceHash: summary.sourceHash, validUntil, recipient: { name, email }, reviewAttested: true });
            return;
        }
        if (!summary.offer)
            throw new Error('Reload the retained offer.');
        let extra: Record<string, unknown> = {};
        if (evidence) {
            if (!company.timeZone)
                throw new Error('Company timezone is unavailable.');
            extra = { occurredAt: resolveLocal(occurred, '', company.timeZone), evidenceReference: reference, attested: true, ...(action === 'delivered' ? { method } : { respondent: { name, email }, capacity, authorityReference: authority }) };
        }
        void command.run({ ...base, offerId: summary.offer.id, expectedSequence: summary.offer.sequence, action, ...extra });
    }
    catch (e) {
        command.setError((e as Error).message);
    } }
    return <Dialog class="bid-review-dialog agreement-form" close={() => { if (command.canClose())
        close(); }}><DialogTitle>{labels[action]} · revision {summary.version}</DialogTitle><Notice>{action === 'offer' ? 'Freeze the approved exact scope, proposed PDF, reviewed issuer and recipient. This action does not deliver the offer.' : action === 'accepted' ? 'Record attributed evidence of an externally received customer response. This does not verify a signature or activate coverage.' : action === 'delivered' ? 'Record delivery that happened outside this app. No email or portal message is sent.' : 'Retain an explicit lifecycle decision without deleting the original offer or generating work.'}</Notice>{command.error && <Notice tone="danger">{command.error}</Notice>}{command.uncertain && <Notice tone="warning">Outcome uncertain. Retry the exact request before leaving.</Notice>}{(action === 'offer' || response) && <><TextField label={action === 'offer' ? 'Recipient name' : 'Respondent name'} value={name} maxLength={200} disabled={locked} onInput={e => { command.changed(); setName(e.currentTarget.value); }}/><TextField label={action === 'offer' ? 'Recipient email' : 'Respondent email'} type="email" value={email} maxLength={254} disabled={locked} onInput={e => { command.changed(); setEmail(e.currentTarget.value); }}/></>}{action === 'offer' && <><p>Reviewed issuer: {summary.issuer?.legalName}</p><TextField label="Offer valid through (Company date)" type="date" value={validUntil} min={summary.companyDate} disabled={locked} onInput={e => { command.changed(); setValidUntil(e.currentTarget.value); }}/></>}{evidence && <><TextField label="When the external event occurred" type="datetime-local" value={occurred} disabled={locked || !company.timeZone} onInput={e => { command.changed(); setOccurred(e.currentTarget.value); }}/><TextField label="External evidence reference" value={reference} maxLength={2000} disabled={locked} onInput={e => { command.changed(); setReference(e.currentTarget.value); }}/></>}{action === 'delivered' && <Select label="External delivery method" value={method} options={[{ value: 'email', label: 'Email' }, { value: 'in_person', label: 'In person' }, { value: 'external_portal', label: 'External portal' }, { value: 'other', label: 'Other' }]} disabled={locked} onValueChange={v => { command.changed(); setMethod(v); }}/>}{response && <><TextField label="Respondent capacity / authority" value={capacity} maxLength={200} disabled={locked} onInput={e => { command.changed(); setCapacity(e.currentTarget.value); }}/><TextField label="Supporting authority evidence reference" value={authority} maxLength={2000} disabled={locked} onInput={e => { command.changed(); setAuthority(e.currentTarget.value); }}/></>}<TextField label="Decision / review reason" value={reason} maxLength={2000} disabled={locked} onInput={e => { command.changed(); setReason(e.currentTarget.value); }}/><Checkbox label={action === 'offer' ? 'I reviewed the exact PDF against scope, price, terms, issuer, recipient and expiry.' : 'I reviewed this evidence and its attribution to the exact retained offer/PDF.'} checked={attested} disabled={locked} onChange={e => { command.changed(); setAttested(e.currentTarget.checked); }}/><div class="agreement-actions"><Button disabled={command.busy || command.uncertain} onClick={() => { if (command.canClose())
        close(); }}>Cancel</Button><Button variant="primary" disabled={readOnly || command.busy} onClick={submit}>{command.uncertain ? 'Retry exact command' : labels[action]}</Button></div></Dialog>;
}
export function AgreementLifecycle({ id, version, customerName, changed }: {
    id: string;
    version: number;
    customerName: string;
    changed(): void;
}) {
    const { user } = useAccount(), { readOnly } = useConnectivity(), company = useCompanyTimeZone(), [data, setData] = useState<Summary | null>(null), [history, setHistory] = useState<History | null>(null), [page, setPage] = useState(1), [revision, setRevision] = useState(0), [error, setError] = useState(''), [action, setAction] = useState<string | null>(null);
    useEffect(() => { let live = true; setData(null); setHistory(null); setError(''); void Promise.all([accountRequest<Summary>(`/api/agreements/${id}/lifecycle`), accountRequest<History>(`/api/agreements/${id}/lifecycle/history?page=${page}`)]).then(([summary, events]) => { if (live) {
        setData(summary);
        setHistory(events);
    } }).catch(e => { if (live)
        setError((e as Error).message); }); return () => { live = false; }; }, [id, version, page, revision]);
    const offer = data?.offer, actions = offer?.state === 'offer' ? ['delivered', 'withdrawn', 'expired'] : offer?.state === 'delivered' ? ['accepted', 'declined', 'withdrawn', 'expired'] : [];
    return <section class="detail-section"><header class="agreement-actions"><h3>Offer and customer response</h3><Button disabled={!!action} onClick={() => setRevision(r => r + 1)}>Refresh lifecycle</Button></header>{error && <Notice tone="warning">{error}</Notice>}{!data && !error && <p role="status">Loading retained offer…</p>}{data && <>{offer ? <><Badge>{stateLabels[offer.state] || offer.state}</Badge><p>Revision {offer.version} · {offer.recipient.name} · {offer.recipient.email}</p><p class="workspace-help">Issuer: {offer.snapshot.issuer.legalName} · Valid through {offer.validUntil}</p><a class="btn ui-button" href={`/api/agreements/documents/${offer.documentId}/download`} download>Download exact offered PDF</a><details><summary>Frozen offer identity</summary><p class="agreement-text">Snapshot SHA-256 {offer.snapshotHash}</p><p class="agreement-text">PDF SHA-256 {offer.pdfHash}</p></details>{offer.state === 'accepted' && <Notice>Acceptance evidence is recorded; signature verification and coverage activation are separate. Accepted scope is protected from draft edits.</Notice>}</> : <><p>No offer retained for this revision.</p>{data.blockers.map(blocker => <p class="workspace-help" key={blocker}>{blocker}</p>)}</>}{isAdministrator(user) && <div class="agreement-actions">{!offer && <Button variant="primary" disabled={readOnly || !data.canOffer} onClick={() => setAction('offer')}>Freeze approved offer</Button>}{actions.map(value => <Button key={value} disabled={readOnly || (value === 'expired' && data.companyDate <= (offer?.validUntil ?? data.companyDate))} onClick={() => setAction(value)}>{labels[value]}</Button>)}</div>}<p class="workspace-help">No customer communication, verified electronic signature, activation, invoice or recurring work is created by these actions.</p><details><summary>Retained lifecycle evidence across revisions</summary>{history?.rows.map(event => <article class="agreement-history" key={event.id}><strong>Revision {event.version} · {stateLabels[event.action] || event.action}</strong><small>{company.timeZone ? formatTimestamp(event.recordedAt, company.timeZone) : 'Company time unavailable'} · Actor {event.actorId}</small><p>{event.reason}</p><details><summary>Exact retained evidence</summary><pre>{JSON.stringify(event.evidence, null, 2)}</pre></details></article>)}{history && !history.rows.length && <p>No offer or customer-response evidence recorded.</p>}<div class="agreement-actions"><Button disabled={page <= 1 || !!action} onClick={() => setPage(p => p - 1)}>Newer</Button><span>Page {page}</span><Button disabled={!history?.hasMore || !!action} onClick={() => setPage(p => p + 1)}>Older</Button></div></details>{action && <LifecycleCommand id={id} summary={data} action={action} customerName={customerName} close={() => setAction(null)} saved={() => { setAction(null); changed(); }}/>}</>}</section>;
}
