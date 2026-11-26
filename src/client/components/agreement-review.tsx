import { useEffect, useState } from 'preact/hooks';
import { accountRequest, useAccount, isAdministrator } from '../auth';
import { useConnectivity } from '../hooks/use-connectivity';
import { useGuardedCommand } from '../hooks/use-guarded-command';
import { Dialog, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { TextField } from './ui/input';
import { Notice, Checkbox, Badge } from './ui/surfaces';
export interface AgreementReviewState {
    status: string;
    sequence: number;
    sourceHash: string;
    sourceChanged: boolean;
}
interface History {
    rows: {
        id: string;
        version: number;
        sequence: number;
        action: string;
        status: string;
        sourceHash: string;
        actorId: string;
        reason: string;
        createdAt: string;
        context: unknown;
    }[];
    hasMore: boolean;
}
const labels: Record<string, string> = { submit: 'Submit for review', approve: 'Approve internal draft', reject: 'Return for revision', withdraw: 'Withdraw review / approval' };
function ReviewCommand({ agreementId, version, review, action, close, saved }: {
    agreementId: string;
    version: number;
    review: AgreementReviewState;
    action: string;
    close(): void;
    saved(): void;
}) {
    const { readOnly } = useConnectivity(), [reason, setReason] = useState(''), [attested, setAttested] = useState(false), command = useGuardedCommand<Record<string, unknown>, unknown>(`/api/agreements/${agreementId}/review`, saved), locked = readOnly || command.busy || command.uncertain;
    function submit() {
        if (reason.trim().length < 10 || !attested) {
            command.setError('Record a reason of at least 10 characters and confirm this internal review.');
            return;
        }
        void command.run({ id: crypto.randomUUID(), requestKey: crypto.randomUUID(), expectedVersion: version, expectedReviewSequence: review.sequence, action, reason, reviewAttested: true });
    }
    return <Dialog class="bid-review-dialog agreement-form" close={() => {
            if (command.canClose())
                close();
        }}><DialogTitle>{labels[action]} · revision {version}</DialogTitle><Notice>This decision concerns the exact current draft revision and native scope. Internal approval is not customer acceptance, coverage activation or authorization to generate work.</Notice>{command.error && <Notice tone="danger">{command.error}</Notice>}{command.uncertain && <Notice tone="warning">Outcome uncertain. Retry the exact review command before leaving.</Notice>}<TextField label="Review reason" value={reason} maxLength={2000} disabled={locked} onInput={e => { command.changed(); setReason(e.currentTarget.value); }}/><Checkbox label="I reviewed the proposed customer, scope, terms, dates and pricing, and understand that this is an internal draft decision." checked={attested} disabled={locked} onChange={e => { command.changed(); setAttested(e.currentTarget.checked); }}/><div class="agreement-actions"><Button disabled={command.busy || command.uncertain} onClick={() => {
            if (command.canClose())
                close();
        }}>Cancel</Button><Button variant="primary" disabled={readOnly || command.busy} onClick={submit}>{command.uncertain ? 'Retry exact request' : labels[action]}</Button></div></Dialog>;
}
export function AgreementReview({ agreementId, version, archived, review, offerLocked = false, saved }: {
    agreementId: string;
    version: number;
    archived: boolean;
    review?: AgreementReviewState;
    offerLocked?: boolean;
    saved(): void;
}) {
    const { user } = useAccount(), { readOnly } = useConnectivity(), [action, setAction] = useState<string | null>(null), [history, setHistory] = useState<History | null>(null), [page, setPage] = useState(1), [error, setError] = useState('');
    useEffect(() => {
        if (!review)
            return;
        let live = true;
        setHistory(null);
        setError('');
        void accountRequest<History>(`/api/agreements/${agreementId}/review-history?page=${page}`).then(value => {
            if (live)
                setHistory(value);
        }).catch(e => {
            if (live)
                setError((e as Error).message);
        });
        return () => { live = false; };
    }, [agreementId, version, review?.sequence, page]);
    if (!review)
        return <Notice>Review workflow is unavailable on this backend. Reload after the application backend is updated.</Notice>;
    const actions = ['not_submitted', 'rejected', 'withdrawn'].includes(review.status) ? ['submit'] : review.status === 'submitted' ? ['approve', 'reject', 'withdraw'] : review.status === 'approved' ? ['withdraw'] : [];
    return <section class="detail-section"><h3>Internal draft review <Badge>{review.status.replaceAll('_', ' ')}</Badge></h3><p class="workspace-help">Revision {version} · review sequence {review.sequence}. Editing creates a new revision requiring a new review. No customer acceptance or active coverage is implied.</p>{review.sourceChanged && <Notice tone="warning">Native customer or scope labels changed since this review context. Withdraw and resubmit before approval; earlier decisions remain retained.</Notice>}{archived && <Notice>Restore the draft through a new revision before reviewing.</Notice>}{isAdministrator(user) && <div class="agreement-actions">{actions.map(value => <Button key={value} disabled={readOnly || archived || offerLocked || (value === 'approve' && review.sourceChanged)} onClick={() => setAction(value)}>{labels[value]}</Button>)}</div>}<details><summary>Retained review decisions across revisions</summary>{error && <Notice tone="warning">{error}</Notice>}{history?.rows.map(event => <article class="agreement-history" key={event.id}><strong>Revision {event.version} · {event.action} · {event.status}</strong><small>{event.createdAt} UTC · {event.actorId}</small><p>{event.reason}</p><details><summary>Exact reviewed source context</summary><pre>{JSON.stringify(event.context, null, 2)}</pre><small>SHA-256 {event.sourceHash}</small></details></article>)}{history && !history.rows.length && <p>No review decisions recorded.</p>}<div class="agreement-actions"><Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Newer</Button><span>Page {page}</span><Button disabled={!history?.hasMore} onClick={() => setPage(p => p + 1)}>Older</Button></div></details>{action && <ReviewCommand agreementId={agreementId} version={version} review={review} action={action} close={() => setAction(null)} saved={() => { setAction(null); saved(); }}/>}</section>;
}
