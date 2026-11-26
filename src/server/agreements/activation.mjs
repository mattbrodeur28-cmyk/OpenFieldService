import { z } from 'zod';
import { createHash } from 'node:crypto';
import { parse, uuid, reader, writer, fail } from './domain.mjs';
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex'), digest = z.string().regex(/^[a-f0-9]{64}$/), reason = z.string().trim().min(10).max(2000);
const date = z.string().refine(v => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Choose a valid Company date.');
const activateInput = z.object({ id: uuid, requestKey: uuid, offerId: uuid, expectedAcceptanceSequence: z.number().int().positive().safe(), expectedSnapshotHash: digest, expectedPdfHash: digest, reason, reviewAttested: z.literal(true) }).strict();
const cancelInput = z.object({ id: uuid, requestKey: uuid, activationId: uuid, expectedSourceToken: digest, effectiveOn: date, reason, reviewAttested: z.literal(true) }).strict();
const coverageInput = z.object({ assetId: uuid, date: date.optional() }).strict();
export function createAgreementActivation({ repo, get, timeZone = () => 'UTC', clock = () => new Date() }) {
    function now() {
        const value = clock();
        if (!Number.isFinite(value.getTime()))
            throw new Error('Agreement clock is invalid.');
        return value;
    }
    function day(instant, zone) { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant).map(part => [part.type, part.value])); return `${p.year}-${p.month}-${p.day}`; }
    function state(activation, cancellation, companyDate) {
        if (!activation)
            return 'not_authorized';
        if (companyDate < activation.authorizedOn)
            return 'not_authorized_yet';
        if (cancellation && companyDate >= cancellation.effectiveOn)
            return 'cancelled';
        if (companyDate < activation.startsOn)
            return 'scheduled';
        if (companyDate > activation.endsOn)
            return 'expired';
        return 'active';
    }
    function inSnapshot(id, observation) { const activation = repo.activation(id), cancellation = activation ? repo.activationCancellation(activation.id) : null, observed = observation ?? now(), zone = activation?.timeZone ?? timeZone(), companyDate = day(observed, zone); return { activation, cancellation, authorizationActive: state(activation, cancellation, companyDate) === 'active', state: state(activation, cancellation, companyDate), companyDate, observedAt: observed.toISOString(), sourceToken: hash({ activation, cancellation }), billingEntitlement: false, workGenerated: false }; }
    function replay(user, key, fingerprint) {
        const prior = repo.prior(key);
        if (!prior)
            return null;
        if (prior.actor_id !== user.id)
            fail('This request belongs to another account.', 403);
        if (prior.request_hash !== fingerprint)
            fail('Request key has different activation content.', 409);
        return JSON.parse(prior.result_json);
    }
    function accepted(id, offerId) {
        const offer = repo.offerById(offerId);
        if (!offer || offer.agreementId !== id)
            fail('Choose an offer belonging to this agreement.', 404);
        const event = repo.offerEventHead(offer.id);
        if (event?.action !== 'accepted')
            fail('Record acceptance of the exact offered agreement before authorization.', 409);
        if (hash(offer.snapshot) !== offer.snapshotHash || offer.snapshot.source.proposedDocument.sha256 !== offer.pdfHash)
            fail('Accepted offer source integrity needs review.', 409);
        return { offer, event };
    }
    function ownership(offer) {
        const d = offer.snapshot.source.document;
        repo.validateCoverage(d);
        for (const asset of offer.snapshot.source.scope.assets) {
            const current = repo.activationAsset(asset.id);
            if (!current || current.customerId !== d.customerId || current.siteId !== asset.siteId)
                fail('Accepted equipment ownership/location changed. Review an explicit amendment before authorization.', 409);
            if (current.status === 'retired')
                fail('Accepted equipment is retired. Review its replacement through an amendment.', 409);
        }
    }
    function summary(user, id) {
        reader(user);
        parse(uuid, id);
        return repo.within(() => {
            get(id);
            const current = inSnapshot(id), acceptedId = repo.acceptedOffer(id)?.id, offer = acceptedId ? repo.offerById(acceptedId) : null, event = offer ? repo.offerEventHead(offer.id) : null, blockers = [];
            if (!['owner', 'admin'].includes(user.role))
                blockers.push('Owner or Admin access is required.');
            if (!offer)
                blockers.push('Record acceptance of the exact offered agreement first.');
            if (current.activation)
                blockers.push('Authorization is already retained; use explicit cancellation or amendment.');
            if (offer) {
                if (offer.snapshot.source.document.endsOn < current.companyDate)
                    blockers.push('The accepted term has ended.');
                try {
                    ownership(offer);
                }
                catch (error) {
                    if (error.status)
                        blockers.push(error.message);
                    else
                        throw error;
                }
            }
            return { ...current, agreementId: id, acceptedOffer: offer ? { id: offer.id, version: offer.version, snapshotHash: offer.snapshotHash, pdfHash: offer.pdfHash, acceptanceSequence: event.sequence, documentId: offer.documentId, startsOn: offer.snapshot.source.document.startsOn, endsOn: offer.snapshot.source.document.endsOn } : null, canAuthorize: blockers.length === 0, blockers, customerAcceptanceVerified: false };
        });
    }
    function authorize(user, id, raw) {
        writer(user);
        parse(uuid, id);
        const d = parse(activateInput, raw), fingerprint = hash({ action: 'authorize_agreement', agreementId: id, ...d });
        return repo.within(() => {
            const previous = replay(user, d.requestKey, fingerprint);
            if (previous)
                return previous;
            get(id);
            if (repo.activationIdentityExists(d.id))
                fail('Authorization identity already exists.', 409);
            if (repo.activation(id))
                fail('This agreement already has retained authorization. Use an explicit amendment or cancellation.', 409);
            const { offer, event } = accepted(id, d.offerId);
            if (event.sequence !== d.expectedAcceptanceSequence || offer.snapshotHash !== d.expectedSnapshotHash || offer.pdfHash !== d.expectedPdfHash)
                fail('Accepted source changed. Reload before authorizing.', 409);
            ownership(offer);
            const document = offer.snapshot.source.document, startsOn = parse(date, document.startsOn), endsOn = parse(date, document.endsOn), observed = now(), zone = timeZone(), authorizedOn = day(observed, zone);
            if (startsOn > endsOn || endsOn < authorizedOn)
                fail('Do not authorize an already-ended or invalid accepted term.', 409);
            repo.addActivation(d, id, offer, event.id, startsOn, endsOn, zone, authorizedOn, observed.toISOString(), user);
            const result = { ...inSnapshot(id), agreementId: id, communicationSent: false, customerAcceptanceVerified: false };
            repo.acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }
    function cancel(user, id, raw) {
        writer(user);
        parse(uuid, id);
        const d = parse(cancelInput, raw), fingerprint = hash({ action: 'cancel_agreement_authorization', agreementId: id, ...d });
        return repo.within(() => {
            const previous = replay(user, d.requestKey, fingerprint);
            if (previous)
                return previous;
            get(id);
            const current = inSnapshot(id);
            if (!current.activation || current.activation.id !== d.activationId)
                fail('Choose the retained authorization for this agreement.', 404);
            if (current.sourceToken !== d.expectedSourceToken || current.cancellation)
                fail('Authorization changed or cancellation was already recorded. Reload first.', 409);
            if (d.effectiveOn < current.companyDate || d.effectiveOn > current.activation.endsOn)
                fail('Cancellation must be today or later, within the accepted term. Historical corrections need separate review.', 409);
            if (repo.activationCancellationIdentityExists(d.id))
                fail('Cancellation identity already exists.', 409);
            repo.addActivationCancellation(d, current.observedAt, user);
            const result = { ...inSnapshot(id), agreementId: id, communicationSent: false, jobsCancelled: false, refundSent: false };
            repo.acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }
    function coverage(user, id, raw) {
        reader(user);
        parse(uuid, id);
        const q = parse(coverageInput, raw);
        return repo.within(() => {
            get(id);
            const current = inSnapshot(id), selected = q.date ?? current.companyDate, scopeState = state(current.activation, current.cancellation, selected), asset = repo.activationAsset(q.assetId);
            if (!asset)
                fail('Equipment not found.', 404);
            let decision = scopeState === 'active' ? 'outside_equipment_scope' : scopeState;
            if (current.activation && scopeState === 'active') {
                const { offer } = accepted(id, current.activation.offerId), frozen = offer.snapshot.source.scope.assets.find(item => item.id === q.assetId);
                if (frozen) {
                    if (asset.customerId !== offer.snapshot.source.document.customerId || asset.siteId !== frozen.siteId)
                        decision = 'ownership_changed';
                    else if (asset.status === 'retired')
                        decision = 'equipment_retired';
                    else
                        decision = 'scope_eligible';
                }
            }
            return { agreementId: id, activationId: current.activation?.id ?? null, assetId: q.assetId, date: selected, observedAt: current.observedAt, decision, scopeEligible: decision === 'scope_eligible', basis: 'accepted_scope_current_native_ownership', billingEntitlement: false, includedVisits: null, includedHours: null, responsePriority: null, workGenerated: false };
        });
    }
    function decorateInSnapshot(user, rows) { reader(user); const observed = now(); return rows.map(row => { const result = inSnapshot(row.id, observed); return { ...row, operationalState: result.state, authorizationActive: result.authorizationActive, cancellationEffectiveOn: result.cancellation?.effectiveOn ?? null }; }); }
    return { summary, authorize, cancel, coverage, decorateInSnapshot };
}
