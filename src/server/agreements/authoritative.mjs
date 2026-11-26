import { z } from 'zod';
import { createHash } from 'node:crypto';
import { parse, uuid, reader, writer, fail } from './domain.mjs';

// CONTRACT-001 authoritative document: binds the exact accepted offer's immutable PDF
// (and acceptance event) as the authoritative contract document for an agreement.
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reason = z.string().trim().min(10).max(2000);
const input = z.object({ id: uuid, requestKey: uuid, offerId: uuid, expectedAcceptanceSequence: z.number().int().positive().safe(), reason, reviewAttested: z.literal(true) }).strict();

export function createAgreementAuthoritative({ db, repo, get }) {
    function replay(user, key, fingerprint) {
        const prior = repo.prior(key);
        if (!prior)
            return null;
        if (prior.actor_id !== user.id)
            fail('This request belongs to another account.', 403);
        if (prior.request_hash !== fingerprint)
            fail('Request key has different authoritative-document content.', 409);
        return JSON.parse(prior.result_json);
    }
    const readDocument = agreementId => {
        const row = db.prepare('SELECT id,agreement_id AS agreementId,offer_id AS offerId,acceptance_event_id AS acceptanceEventId,pdf_hash AS pdfHash,actor_id AS actorId,reason,created_at AS createdAt FROM _agreement_authoritative_documents WHERE agreement_id=?').get(agreementId);
        return row ? { ...row } : null;
    };
    function authorize(user, agreementId, raw) {
        writer(user);
        parse(uuid, agreementId);
        const d = parse(input, raw), fingerprint = hash({ action: 'authorize_agreement_document', agreementId, ...d });
        return repo.within(() => {
            const previous = replay(user, d.requestKey, fingerprint);
            if (previous)
                return previous;
            get(agreementId);
            if (db.prepare('SELECT 1 FROM _agreement_authoritative_documents WHERE agreement_id=?').get(agreementId))
                fail('The authoritative document is already retained for this agreement.', 409);
            const offer = repo.offerById(d.offerId);
            if (!offer || offer.agreementId !== agreementId)
                fail('Choose an offer belonging to this agreement.', 404);
            const event = repo.offerEventHead(offer.id);
            if (event?.action !== 'accepted' || event.sequence !== d.expectedAcceptanceSequence)
                fail('Record acceptance of the exact offered agreement first.', 409);
            db.prepare('INSERT INTO _agreement_authoritative_documents(id,agreement_id,offer_id,acceptance_event_id,pdf_hash,actor_id,reason) VALUES(?,?,?,?,?,?,?)').run(d.id, agreementId, offer.id, event.id, offer.pdfHash, user.id, d.reason);
            const result = { document: readDocument(agreementId), communicationSent: false, customerAcceptanceVerified: false };
            repo.acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }
    function detail(user, agreementId) {
        reader(user);
        parse(uuid, agreementId);
        return repo.within(() => {
            get(agreementId);
            return readDocument(agreementId);
        });
    }
    return { authorize, detail };
}
