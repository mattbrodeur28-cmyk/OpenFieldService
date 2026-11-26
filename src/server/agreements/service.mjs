import { createAgreementActivation } from "./activation.mjs";
import { createAgreementLifecycle } from "./lifecycle.mjs";
import { createAgreementMaintenance } from "./maintenance.mjs";
import { createAgreementRenewal } from "./renewal.mjs";
import { identifyFile, MAX_DOCUMENT_BYTES } from "../documents/service.mjs";
import { createHash } from 'node:crypto';
import { createAgreementRepository } from './repository.mjs';
import { parse, uuid, commandInput, listQuery, historyQuery, optionsQuery, reviewInput, documentInput, documentQuery, reader, writer, fail } from './domain.mjs';
export function createAgreements({ storage, issuer, timeZone, clock, maintenanceJobs }) {
    const repo = createAgreementRepository(storage), get = id => {
        const row = repo.head(id);
        if (!row)
            fail('Agreement draft not found.', 404);
        return row;
    };
    const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    function source(agreement) {
        const context = { agreementId: agreement.id, version: agreement.version, document: agreement.document, customer: repo.customer(agreement.customer_id), scope: repo.scope(agreement.document) }, attachment = repo.sourceDocument(agreement.id, agreement.version);
        if (attachment)
            context.proposedDocument = attachment;
        return context;
    }
    function reviewState(agreement) { const current = repo.reviewHead(agreement.id, agreement.version), sourceHash = hash(source(agreement)); return { status: current?.status ?? 'not_submitted', sequence: current?.sequence ?? 0, sourceHash, current, sourceChanged: !!current && current.sourceHash !== sourceHash, customerAccepted: false, coverageActivated: false }; }
    function detail(user, id) { reader(user); parse(uuid, id); return repo.within(() => { const agreement = get(id), context = source(agreement); return { agreement, customer: context.customer, scope: context.scope, proposedDocument: context.proposedDocument ?? null, writeLock: repo.lockedOffer(id) ? "An open or accepted offer protects this scope. Withdraw an open offer before editing; accepted scope requires an amendment." : null, review: reviewState(agreement) }; }); }
    function proposedDocument(user, id, query = {}) { reader(user); parse(uuid, id); const q = parse(documentQuery, query); return repo.within(() => { const agreement = get(id); return { agreementId: id, version: q.version ?? agreement.version, document: repo.sourceDocument(id, q.version ?? agreement.version) }; }); }
    function uploadDocument(user, id, raw, bytes, filename) {
        writer(user);
        parse(uuid, id);
        const d = parse(documentInput, raw);
        if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > MAX_DOCUMENT_BYTES)
            fail('Choose a nonempty PDF up to 10 MiB.', 413);
        let media;
        try {
            media = identifyFile(bytes);
        }
        catch {
            fail('Upload a PDF with a supported file signature.', 415);
        }
        if (media !== 'application/pdf')
            fail('The proposed contract must be a PDF.', 415);
        const original = typeof filename === 'string' ? filename.replaceAll('\\', '/').split('/').pop().replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200) || 'contract.pdf' : 'contract.pdf', sha256 = createHash('sha256').update(bytes).digest('hex'), digest = hash({ action: 'upload_agreement_document', agreementId: id, ...d, sha256, size: bytes.length, original });
        return repo.within(() => {
            const prior = repo.prior(d.requestKey);
            if (prior) {
                if (prior.actor_id !== user.id)
                    fail('This request belongs to another account.', 403);
                if (prior.request_hash !== digest)
                    fail('Request key has different document content.', 409);
                return JSON.parse(prior.result_json);
            }
            const agreement = get(id);
            if (agreement.version !== d.expectedVersion)
                fail('Draft revision changed. Reload before uploading.', 409);
            if (agreement.archived)
                fail('Restore the draft before uploading.', 409);
            const state = reviewState(agreement);
            if (['submitted', 'approved'].includes(state.status))
                fail('Withdraw the current review before attaching a proposed PDF.', 409);
            if (repo.sourceDocument(id, d.expectedVersion))
                fail('This draft revision already has a retained PDF. Create a new revision for a replacement.', 409);
            const document = repo.addDocument(d, id, user, bytes, original, sha256), result = { document, customerAccepted: false, coverageActivated: false, communicationSent: false };
            repo.acknowledge(d.requestKey, user, digest, result);
            return result;
        });
    }
    function downloadDocument(user, id) {
        reader(user);
        parse(uuid, id);
        return repo.within(() => {
            const document = repo.documentById(id);
            if (!document)
                fail('Proposed contract document not found.', 404);
            get(document.agreementId);
            return { document, bytes: new Uint8Array(repo.documentBytes(id)) };
        });
    }
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
            if (repo.lockedOffer(id))
                fail("Withdraw the open offer before changing review; accepted agreements require amendments.", 409);
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
            const page = repo.list(q);
            return { ...page, rows: activation.decorateInSnapshot(user, page.rows) };
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
            if (repo.lockedOffer(document.id))
                fail("Withdraw the open offer before editing; accepted agreements require amendments.", 409);
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
    const lifecycle = createAgreementLifecycle({ repo, get, source, reviewState, issuer, timeZone, clock });
    const activation = createAgreementActivation({ repo, get, timeZone, clock });
    const maintenance = createAgreementMaintenance({ db: storage.database, repo, get, timeZone, clock, jobs: maintenanceJobs });
    const renewal = createAgreementRenewal({ db: storage.database, repo, get });
    return { detail, list, save, history, options, review, reviewHistory, proposedDocument, uploadDocument, downloadDocument, lifecycle, activation, maintenance, renewal };
}
