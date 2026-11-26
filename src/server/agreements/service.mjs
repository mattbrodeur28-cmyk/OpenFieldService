import { createHash } from 'node:crypto';
import { createAgreementRepository } from './repository.mjs';
import { parse, uuid, commandInput, listQuery, historyQuery, optionsQuery, reviewInput, reader, writer, fail } from './domain.mjs';
export function createAgreements({ storage }) {
    const repo = createAgreementRepository(storage), get = id => {
        const row = repo.head(id);
        if (!row)
            fail('Agreement draft not found.', 404);
        return row;
    };
    const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    function source(agreement) { return { agreementId: agreement.id, version: agreement.version, document: agreement.document, customer: repo.customer(agreement.customer_id), scope: repo.scope(agreement.document) }; }
    function reviewState(agreement) { const current = repo.reviewHead(agreement.id, agreement.version), sourceHash = hash(source(agreement)); return { status: current?.status ?? 'not_submitted', sequence: current?.sequence ?? 0, sourceHash, current, sourceChanged: !!current && current.sourceHash !== sourceHash, customerAccepted: false, coverageActivated: false }; }
    function detail(user, id) { reader(user); parse(uuid, id); return repo.within(() => { const agreement = get(id), context = source(agreement); return { agreement, customer: context.customer, scope: context.scope, review: reviewState(agreement) }; }); }
    function review(user, id, raw) {
        writer(user);
        parse(uuid, id);
        const input = parse(reviewInput, raw), digest = hash({ action: 'agreement_review', agreementId: id, ...input });
        return repo.within(() => {
            const prior = repo.prior(input.requestKey);
            if (prior) {
                if (prior.actor_id !== user.id)
                    fail('This request belongs to another account.', 403);
                if (prior.request_hash !== digest)
                    fail('Request key has different review content.', 409);
                return JSON.parse(prior.result_json);
            }
            const agreement = get(id);
            if (agreement.version !== input.expectedVersion)
                fail('Draft revision changed. Reload before reviewing.', 409);
            if (agreement.archived)
                fail('Restore the draft before reviewing.', 409);
            const state = reviewState(agreement);
            if (state.sequence !== input.expectedReviewSequence)
                fail('Review history changed. Reload before deciding.', 409);
            if (state.sequence === Number.MAX_SAFE_INTEGER)
                fail('Review sequence needs administrator attention.', 409);
            const transitions = { submit: { from: ['not_submitted', 'rejected', 'withdrawn'], to: 'submitted' }, approve: { from: ['submitted'], to: 'approved' }, reject: { from: ['submitted'], to: 'rejected' }, withdraw: { from: ['submitted', 'approved'], to: 'withdrawn' } }, transition = transitions[input.action];
            if (!transition.from.includes(state.status))
                fail('This review action is unavailable in the current state.', 409);
            if (['submit', 'approve'].includes(input.action)) {
                repo.validateCoverage(agreement.document);
                const d = agreement.document;
                if (!d.scope.trim() || !d.terms.trim() || !d.startsOn || !d.endsOn || d.priceCents === null || !d.siteIds.length)
                    fail('Review requires proposed scope, terms, start/end dates, known price and at least one location.', 409);
            }
            if (input.action === 'approve' && state.sourceChanged)
                fail('Native scope or customer details changed since submission. Withdraw and submit a new reviewed context.', 409);
            if (repo.reviewExists(input.id))
                fail('Review event identity already exists.', 409);
            const context = source(agreement);
            repo.addReview(input.id, id, agreement.version, state.sequence + 1, input.action, transition.to, hash(context), context, user, input.reason);
            const result = { agreementId: id, version: agreement.version, review: reviewState(agreement), communicationSent: false, customerAccepted: false, coverageActivated: false, workGenerated: false };
            repo.acknowledge(input.requestKey, user, digest, result);
            return result;
        });
    }
    function reviewHistory(user, id, query = {}) { reader(user); parse(uuid, id); const { page } = parse(historyQuery, query); return repo.within(() => { get(id); const rows = repo.reviewHistory(id, page); return { rows: rows.slice(0, 25), hasMore: rows.length > 25, page }; }); }
    function list(user, query = {}) {
        reader(user);
        const q = parse(listQuery, query);
        return repo.within(() => {
            if (q.customerId)
                repo.customer(q.customerId);
            return repo.list(q);
        });
    }
    function save(user, raw) {
        writer(user);
        const input = parse(commandInput, raw), { requestKey, expectedVersion, reason, ...document } = input, digest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
        return repo.within(() => {
            const prior = repo.prior(requestKey);
            if (prior) {
                if (prior.actor_id !== user.id)
                    fail('This request belongs to another account.', 403);
                if (prior.request_hash !== digest)
                    fail('Request key has different agreement content.', 409);
                return JSON.parse(prior.result_json);
            }
            const old = repo.head(document.id);
            if ((old?.version ?? 0) !== expectedVersion)
                fail('Agreement draft changed. Reload and review before saving.', 409);
            if (expectedVersion === Number.MAX_SAFE_INTEGER)
                fail('Agreement version needs administrator review.', 409);
            if (old && old.customer_id !== document.customerId)
                fail('Agreement customer identity cannot be reassigned. Create a separate reviewed draft.', 409);
            repo.validateCoverage(document);
            const agreement = repo.save(document, user, reason), result = { agreement, customer: repo.customer(document.customerId), communicationSent: false, coverageActivated: false, workGenerated: false };
            repo.acknowledge(requestKey, user, digest, result);
            return result;
        });
    }
    function history(user, id, query = {}) { reader(user); parse(uuid, id); const { page } = parse(historyQuery, query); return repo.within(() => { get(id); const rows = repo.history(id, page); return { rows: rows.slice(0, 25), hasMore: rows.length > 25, page }; }); }
    function options(user, query = {}) {
        reader(user);
        const q = parse(optionsQuery, query);
        if (q.kind !== "customer" && !q.customerId)
            fail("Choose the agreement customer first.");
        return repo.within(() => repo.options(q));
    }
    return { detail, list, save, history, options, review, reviewHistory };
}
