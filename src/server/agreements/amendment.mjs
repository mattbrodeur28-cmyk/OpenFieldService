import { z } from 'zod';
import { createHash } from 'node:crypto';
import { parse, uuid, reader, writer, fail } from './domain.mjs';

// CONTRACT-002 amendment: create a new amendment draft from an accepted source
// agreement with deliberate overrides, then flow through the normal review/offer/
// acceptance lifecycle. Accepted scope is never silently rewritten.
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reason = z.string().trim().min(10).max(2000);
const price = z.number().int().nonnegative().max(10000000000).safe().nullable();
const input = z.object({
    id: uuid, requestKey: uuid, amendmentDraftId: uuid, expectedVersion: z.number().int().positive().safe(),
    kind: z.enum(['scope', 'price', 'terms', 'other']),
    title: z.string().trim().min(1).max(200).optional(),
    scope: z.string().trim().max(12000).optional(),
    exclusions: z.string().trim().max(8000).optional(),
    terms: z.string().trim().max(12000).optional(),
    documentReference: z.string().trim().max(1000).optional(),
    siteIds: z.array(uuid).max(100).optional(),
    assetIds: z.array(uuid).max(500).optional(),
    priceCents: price.optional(),
    reason, reviewAttested: z.literal(true),
}).strict();

export function createAgreementAmendment({ db, repo, get }) {
    function replay(user, key, fingerprint) {
        const prior = repo.prior(key);
        if (!prior)
            return null;
        if (prior.actor_id !== user.id)
            fail('This request belongs to another account.', 403);
        if (prior.request_hash !== fingerprint)
            fail('Request key has different amendment content.', 409);
        return JSON.parse(prior.result_json);
    }
    function amend(user, sourceId, raw) {
        writer(user);
        parse(uuid, sourceId);
        const d = parse(input, raw), fingerprint = hash({ action: 'amend_agreement', agreementId: sourceId, ...d });
        return repo.within(() => {
            const previous = replay(user, d.requestKey, fingerprint);
            if (previous)
                return previous;
            const source = get(sourceId);
            if (source.version !== d.expectedVersion)
                fail('Agreement changed. Reload before amending.', 409);
            const accepted = repo.acceptedOffer(sourceId);
            if (!accepted)
                fail('Amend only an accepted agreement with retained acceptance.', 409);
            if (repo.head(d.amendmentDraftId))
                fail('The amendment draft identity already exists.', 409);
            const base = source.document;
            const document = {
                ...base,
                id: d.amendmentDraftId,
                title: d.title ?? base.title,
                scope: d.scope ?? base.scope,
                exclusions: d.exclusions ?? base.exclusions,
                terms: d.terms ?? base.terms,
                documentReference: d.documentReference ?? base.documentReference,
                siteIds: d.siteIds ?? base.siteIds,
                assetIds: d.assetIds ?? base.assetIds,
                priceCents: d.priceCents ?? base.priceCents,
                renewalPolicy: 'manual_review',
                archived: false,
            };
            repo.validateCoverage(document);
            repo.save(document, user, d.reason);
            db.prepare('INSERT INTO _agreement_amendments(id,source_agreement_id,amendment_agreement_id,source_version,kind,actor_id,reason) VALUES(?,?,?,?,?,?,?)').run(d.id, sourceId, d.amendmentDraftId, source.version, d.kind, user.id, d.reason);
            const result = { amendment: { id: d.id, sourceAgreementId: sourceId, amendmentAgreementId: d.amendmentDraftId, sourceVersion: source.version, kind: d.kind, status: 'draft' }, communicationSent: false, workGenerated: false };
            repo.acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }
    function history(user, agreementId) {
        reader(user);
        parse(uuid, agreementId);
        return repo.within(() => {
            get(agreementId);
            return { rows: db.prepare('SELECT id,source_agreement_id AS sourceAgreementId,amendment_agreement_id AS amendmentAgreementId,source_version AS sourceVersion,kind,actor_id AS actorId,reason,created_at AS createdAt FROM _agreement_amendments WHERE source_agreement_id=? ORDER BY created_at DESC,id').all(agreementId).map(row => ({ ...row })) };
        });
    }
    return { amend, history };
}
