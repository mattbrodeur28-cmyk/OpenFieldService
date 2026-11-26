import { z } from 'zod';
import { createHash } from 'node:crypto';
import { parse, uuid, reader, writer, fail } from './domain.mjs';
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex'), digest = z.string().regex(/^[a-f0-9]{64}$/), reason = z.string().trim().min(10).max(2000);
const date = z.string().refine(v => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Choose a valid Company date.');
export function companyDay(instant, zone) { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant).map(part => [part.type, part.value])); return `${p.year}-${p.month}-${p.day}`; }
export function termState(activation, cancellation, companyDate) {
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
const activateInput = z.object({ id: uuid, requestKey: uuid, offerId: uuid, expectedAcceptanceSequence: z.number().int().positive().safe(), expectedSnapshotHash: digest, expectedPdfHash: digest, reason, reviewAttested: z.literal(true), includedVisits: z.number().int().nonnegative().max(1000000).safe().nullable().optional(), includedHours: z.number().int().nonnegative().max(100000000).safe().nullable().optional(), responsePriority: z.enum(['normal', 'priority', 'emergency']).nullable().optional() }).strict();
const cancelInput = z.object({ id: uuid, requestKey: uuid, activationId: uuid, expectedSourceToken: digest, effectiveOn: date, reason, reviewAttested: z.literal(true) }).strict();
const coverageInput = z.object({ assetId: uuid, date: date.optional() }).strict();
export function createAgreementActivation({ repo, get, timeZone = () => 'UTC', clock = () => new Date(), laborRate = () => null }) {
    function now() {
        const value = clock();
        if (!Number.isFinite(value.getTime()))
            throw new Error('Agreement clock is invalid.');
        return value;
    }
    function inSnapshot(id, observation) { const activation = repo.activation(id), cancellation = activation ? repo.activationCancellation(activation.id) : null, observed = observation ?? now(), zone = activation?.timeZone ?? timeZone(), companyDate = companyDay(observed, zone); return { activation, cancellation, authorizationActive: termState(activation, cancellation, companyDate) === 'active', state: termState(activation, cancellation, companyDate), companyDate, observedAt: observed.toISOString(), sourceToken: hash({ activation, cancellation }), billingEntitlement: false, workGenerated: false }; }
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
    function computeEntitlement(id, effectiveDate) {
        const current = inSnapshot(id), activation = current.activation;
        const configured = { includedVisits: activation?.includedVisits ?? null, includedHours: activation?.includedHours ?? null, responsePriority: activation?.responsePriority ?? null };
        let consumedVisits = 0, consumedHours = 0, detail = [];
        if (activation) {
            const offer = repo.offerById(activation.offerId), customerId = offer?.snapshot?.source?.document?.customerId ?? null, assetIds = offer?.snapshot?.source?.scope?.assets?.map(item => item.id) ?? [], reports = customerId ? repo.entitlementReports(customerId, assetIds) : [];
            const included = reports.filter(row => termState(activation, current.cancellation, companyDay(new Date(row.visitStartAt), activation.timeZone)) === 'active');
            consumedVisits = included.length;
            consumedHours = included.reduce((sum, row) => sum + row.hours, 0);
            detail = included.map(row => ({ ...row, companyDate: companyDay(new Date(row.visitStartAt), activation.timeZone) }));
        }
        const visitsRemaining = configured.includedVisits === null ? null : Math.max(0, configured.includedVisits - consumedVisits);
        const hoursRemaining = configured.includedHours === null ? null : Math.max(0, configured.includedHours - consumedHours);
        const visitsExhausted = configured.includedVisits !== null && consumedVisits >= configured.includedVisits;
        const hoursExhausted = configured.includedHours !== null && consumedHours >= configured.includedHours;
        const activeOnDate = termState(activation, current.cancellation, effectiveDate ?? current.companyDate) === 'active';
        return { ...current, configured, consumed: { visits: consumedVisits, hours: consumedHours }, remaining: { visits: visitsRemaining, hours: hoursRemaining }, visitsExhausted, hoursExhausted, billingEntitlement: activeOnDate && configured.includedVisits !== null && configured.includedHours !== null && !visitsExhausted && !hoursExhausted, detail };
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
            const document = offer.snapshot.source.document, startsOn = parse(date, document.startsOn), endsOn = parse(date, document.endsOn), observed = now(), zone = timeZone(), authorizedOn = companyDay(observed, zone);
            if (startsOn > endsOn || endsOn < authorizedOn)
                fail('Do not authorize an already-ended or invalid accepted term.', 409);
            repo.addActivation(d, id, offer, event.id, startsOn, endsOn, zone, authorizedOn, observed.toISOString(), user, d.includedVisits ?? null, d.includedHours ?? null, d.responsePriority ?? null);
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
            const current = inSnapshot(id), selected = q.date ?? current.companyDate, scopeState = termState(current.activation, current.cancellation, selected), asset = repo.activationAsset(q.assetId);
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
            const ent = computeEntitlement(id, selected);
            return { agreementId: id, activationId: current.activation?.id ?? null, assetId: q.assetId, date: selected, observedAt: current.observedAt, decision, scopeEligible: decision === 'scope_eligible', basis: 'accepted_scope_current_native_ownership', billingEntitlement: decision === 'scope_eligible' && ent.billingEntitlement, includedVisits: ent.configured.includedVisits, includedHours: ent.configured.includedHours, responsePriority: ent.configured.responsePriority, workGenerated: false };
        });
    }
    function entitlement(user, id) {
        reader(user);
        parse(uuid, id);
        return repo.within(() => {
            get(id);
            const e = computeEntitlement(id);
            return { agreementId: id, state: e.state, companyDate: e.companyDate, observedAt: e.observedAt, configured: e.configured, consumed: e.consumed, remaining: e.remaining, visitsExhausted: e.visitsExhausted, hoursExhausted: e.hoursExhausted, billingEntitlement: e.billingEntitlement, detail: e.detail, workGenerated: false };
        });
    }
    function profitability(user, id) {
        reader(user);
        parse(uuid, id);
        return repo.within(() => {
            get(id);
            const current = inSnapshot(id), activation = current.activation;
            let contractValueCents = null, material = { totalCents: 0, jobs: [] }, laborMinutes = 0;
            if (activation) {
                const offer = repo.offerById(activation.offerId), document = offer?.snapshot?.source?.document;
                contractValueCents = document?.priceCents ?? null;
                const customerId = document?.customerId, assetIds = offer?.snapshot?.source?.scope?.assets?.map(item => item.id) ?? [];
                material = repo.materialCost(customerId, assetIds, activation.startsOn, activation.endsOn);
                const included = repo.entitlementReports(customerId, assetIds).filter(row => termState(activation, current.cancellation, companyDay(new Date(row.visitStartAt), activation.timeZone)) === 'active');
                laborMinutes = included.reduce((sum, row) => sum + row.hours, 0);
            }
            const rate = laborRate();
            const laborCostCents = rate === null ? null : Math.round((laborMinutes * rate) / 60);
            const marginCents = contractValueCents === null || laborCostCents === null ? null : contractValueCents - material.totalCents - laborCostCents;
            return { agreementId: id, state: current.state, companyDate: current.companyDate, observedAt: current.observedAt, contractValueCents, materialCostCents: material.totalCents, laborMinutes, laborRateCentsPerHour: rate, laborCostCents, marginCents, allocation: material.jobs, currency: 'USD', definitions: { contractValue: 'Authorized accepted-term proposed price (priceCents); a contract value, not recognized revenue.', materialCost: 'Net native inventory usage (usage minus return) movement value on in-scope jobs during the authorized term, in cents.', laborCost: 'Approved in-scope work minutes × the reviewed company labor rate, or null until configured.', margin: 'contractValue − materialCost − laborCost.' } };
        });
    }
    function decorateInSnapshot(user, rows) { reader(user); const observed = now(); return rows.map(row => { const result = inSnapshot(row.id, observed); return { ...row, operationalState: result.state, authorizationActive: result.authorizationActive, cancellationEffectiveOn: result.cancellation?.effectiveOn ?? null }; }); }
    return { summary, authorize, cancel, coverage, entitlement, profitability, decorateInSnapshot };
}
