import { z } from 'zod';
import { createHash } from 'node:crypto';
import { parse, uuid, reader, writer, fail, historyQuery } from './domain.mjs';
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const count = z.number().int().nonnegative().safe(), positive = count.refine(v => v > 0), note = z.string().trim().min(10).max(2000), digest = z.string().regex(/^[a-f0-9]{64}$/), date = z.string().refine(v => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Choose a valid offer date.');
const instant = z.string().datetime({ offset: true }).refine(v => Number.isFinite(Date.parse(v)) && date.safeParse(v.slice(0, 10)).success, 'Choose a valid evidence instant.').transform(v => new Date(v).toISOString());
const recipient = z.object({ name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(254) }).strict();
const issuerSchema = z.object({ version: positive, legalName: z.string().min(1).max(200), address: z.string().min(1).max(1000), email: z.string().email().max(254), phone: z.string().max(80), terms: z.string().min(1).max(6000) }).strict();
const offerInput = z.object({ id: uuid, requestKey: uuid, expectedVersion: positive, expectedReviewSequence: count, expectedIssuerVersion: positive, expectedSourceHash: digest, validUntil: date, recipient, reason: note, reviewAttested: z.literal(true) }).strict();
const common = { id: uuid, requestKey: uuid, offerId: uuid, expectedSequence: positive, reason: note };
const evidence = { occurredAt: instant, evidenceReference: note, attested: z.literal(true) };
const responseInput = z.discriminatedUnion('action', [
    z.object({ ...common, action: z.literal('delivered'), ...evidence, method: z.enum(['email', 'in_person', 'external_portal', 'other']) }).strict(),
    ...['accepted', 'declined'].map(action => z.object({ ...common, action: z.literal(action), ...evidence, respondent: recipient, capacity: z.string().trim().min(1).max(200), authorityReference: note }).strict()),
    ...['withdrawn', 'expired'].map(action => z.object({ ...common, action: z.literal(action) }).strict())
]);
export function createAgreementLifecycle({ repo, get, source, reviewState, issuer = () => null, timeZone = () => 'UTC', clock = () => new Date() }) {
    const companyDate = instant => { const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timeZone(), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant).map(p => [p.type, p.value])); return `${parts.year}-${parts.month}-${parts.day}`; };
    function now() { const value = clock(); if (!Number.isFinite(value.getTime()))
        throw new Error('Invalid agreement clock.'); return value; }
    function replay(user, key, fingerprint) { const prior = repo.prior(key); if (!prior)
        return null; if (prior.actor_id !== user.id)
        fail('This request belongs to another account.', 403); if (prior.request_hash !== fingerprint)
        fail('Request key has different offer content.', 409); return JSON.parse(prior.result_json); }
    function offerShape(row) { if (!row)
        return null; const latest = repo.offerEventHead(row.id); return { ...row, state: latest?.action ?? 'offer', sequence: latest?.sequence ?? 0, activationState: 'not_activated', customerAcceptanceVerified: false }; }
    function summary(user, id) { reader(user); parse(uuid, id); return repo.within(() => { const agreement = get(id), review = reviewState(agreement), publicIssuer = issuer(), attachment = repo.sourceDocument(id, agreement.version), offer = repo.offerForRevision(id, agreement.version), blockers = []; if (!['owner', 'admin'].includes(user.role))
        blockers.push('Owner or Admin access is required to offer.'); if (agreement.archived)
        blockers.push('Restore the draft.'); if (review.status !== 'approved' || review.sourceChanged)
        blockers.push('Approve the exact current review context.'); if (!attachment)
        blockers.push('Retain a proposed PDF for this revision.'); if (!publicIssuer)
        blockers.push('Configure and review the business issuer in Settings.'); if (offer)
        blockers.push('This revision already has a retained offer; a replacement requires a new draft revision.'); if (repo.acceptedOffer(id))
        blockers.push('Accepted agreement changes require a separate amendment workflow.'); return { agreementId: id, version: agreement.version, reviewSequence: review.sequence, sourceHash: review.sourceHash, issuer: publicIssuer, proposedDocument: attachment, offer: offerShape(offer), canOffer: blockers.length === 0, blockers, companyDate: companyDate(now()), communicationSent: false }; }); }
    function offer(user, id, raw) { writer(user); parse(uuid, id); const d = parse(offerInput, raw), fingerprint = hash({ action: 'offer_agreement', agreementId: id, ...d }); return repo.within(() => { const previous = replay(user, d.requestKey, fingerprint); if (previous)
        return previous; const agreement = get(id), state = reviewState(agreement); if (agreement.version !== d.expectedVersion || state.sequence !== d.expectedReviewSequence || state.sourceHash !== d.expectedSourceHash)
        fail('Draft or review context changed. Reload before offering.', 409); if (agreement.archived || state.status !== 'approved' || state.sourceChanged)
        fail('Offer only the approved exact current draft context.', 409); if (repo.acceptedOffer(id))
        fail('Accepted agreement changes require a separate amendment.', 409); if (repo.offerForRevision(id, agreement.version))
        fail('This revision already has a retained offer.', 409); if (repo.offerIdentityExists(d.id) || repo.offerEventIdentityExists(d.id))
        fail('Offer/event identity already exists.', 409); const pdf = repo.sourceDocument(id, agreement.version); if (!pdf)
        fail('Retain a proposed PDF before offering.', 409); const publicIssuer = issuer(); if (!publicIssuer)
        fail('Configure and review the business issuer before offering.', 409); const business = parse(issuerSchema, publicIssuer); if (business.version !== d.expectedIssuerVersion)
        fail('Business issuer changed. Reload before offering.', 409); const observed = now(); if (d.validUntil < companyDate(observed))
        fail('Offer expiry cannot precede the company date.', 409); const context = source(agreement), snapshot = { schemaVersion: 1, kind: 'agreement_offer', agreementId: id, revision: agreement.version, reviewId: state.current.id, reviewSequence: state.sequence, issuer: business, recipient: d.recipient, validUntil: d.validUntil, source: context }, snapshotHash = hash(snapshot); repo.addOffer(d, id, agreement.version, state.current.id, pdf.id, business.version, snapshot, snapshotHash, pdf.sha256, user, observed.toISOString()); repo.addOfferEvent(d.id, d.id, 1, 'offer', { snapshotHash, pdfHash: pdf.sha256, reviewAttested: true }, user, d.reason, observed.toISOString()); const result = { offer: offerShape(repo.offerById(d.id)), communicationSent: false, customerAccepted: false, coverageActivated: false, workGenerated: false }; repo.acknowledge(d.requestKey, user, fingerprint, result); return result; }); }
    function record(user, id, raw) { writer(user); parse(uuid, id); const d = parse(responseInput, raw), fingerprint = hash({ action: 'agreement_response', agreementId: id, ...d }); return repo.within(() => { const previous = replay(user, d.requestKey, fingerprint); if (previous)
        return previous; get(id); const row = repo.offerById(d.offerId); if (!row || row.agreementId !== id)
        fail('Choose an offer belonging to this agreement.', 404); const latest = repo.offerEventHead(row.id); if (latest.sequence !== d.expectedSequence)
        fail('Offer response changed. Reload before recording evidence.', 409); if (latest.sequence === Number.MAX_SAFE_INTEGER)
        fail('Offer sequence needs review.', 409); if (['accepted', 'declined', 'withdrawn', 'expired'].includes(latest.action))
        fail('This offer is closed. Preserve its evidence; use an explicit new revision or amendment.', 409); const snapshot = JSON.stringify(row.snapshot); if (hash(snapshot) !== row.snapshotHash || row.snapshot.source.proposedDocument.sha256 !== row.pdfHash)
        fail('Retained offer source integrity needs review.', 409); const observed = now(); let details = { snapshotHash: row.snapshotHash, pdfHash: row.pdfHash }; if (['delivered', 'accepted', 'declined'].includes(d.action)) {
        if (d.occurredAt > observed.toISOString() || d.occurredAt < row.offeredAt)
            fail('Evidence must be after offering and not in the future.', 409);
        const priorOccurred = repo.latestOfferOccurrence(row.id);
        if (priorOccurred && d.occurredAt < priorOccurred)
            fail('Evidence cannot precede the retained delivery/response sequence.', 409);
        if (d.action === 'delivered' && latest.action !== 'offer')
            fail('Delivery was already recorded.', 409);
        if (['accepted', 'declined'].includes(d.action) && latest.action !== 'delivered')
            fail('Record external delivery evidence before the customer response.', 409);
        if (companyDate(observed) > row.validUntil)
            fail('The offer expiry has passed; review expiry and a new offer explicitly.', 409);
        details = { ...details, occurredAt: d.occurredAt, evidenceReference: d.evidenceReference, attested: true, ...(d.action === 'delivered' ? { method: d.method } : { respondent: d.respondent, capacity: d.capacity, authorityReference: d.authorityReference, signatureVerified: false }) };
    }
    else if (d.action === 'expired' && companyDate(observed) <= row.validUntil)
        fail('Expire only after the offered company-date deadline.', 409); if (repo.offerEventIdentityExists(d.id))
        fail('Response event identity already exists.', 409); repo.addOfferEvent(d.id, row.id, latest.sequence + 1, d.action, details, user, d.reason, observed.toISOString()); const result = { offer: offerShape(repo.offerById(row.id)), communicationSent: false, customerAccepted: d.action === 'accepted', customerAcceptanceVerified: false, coverageActivated: false, workGenerated: false }; repo.acknowledge(d.requestKey, user, fingerprint, result); return result; }); }
    function history(user, id, raw = {}) { reader(user); parse(uuid, id); const { page } = parse(historyQuery, raw); return repo.within(() => { get(id); const rows = repo.offerHistory(id, page); return { rows: rows.slice(0, 25), hasMore: rows.length > 25, page }; }); }
    return { summary, offer, record, history };
}
