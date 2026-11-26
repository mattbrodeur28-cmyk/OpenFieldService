import { z } from 'zod';
import { createHash } from 'node:crypto';
import { parse, uuid, reader, writer, fail } from './domain.mjs';

// CONTRACT-006: a renewal creates a linked renewal draft from an authorized source
// agreement with new term dates and pricing, then flows through the normal draft/
// review/offer/accept/authorize lifecycle. The ledger retains the source relationship
// and history. No automatic renewal or silent re-pricing happens here.
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reason = z.string().trim().min(10).max(2000);
const date = z.string().refine(v => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Choose a valid Company date.');
const price = z.number().int().nonnegative().max(10000000000).safe().nullable();
const instant = z.string().datetime({ offset: true }).refine(v => Number.isFinite(Date.parse(v)), 'Choose a valid reminder date and time.').transform(v => new Date(v).toISOString()).optional();
const input = z.object({ id: uuid, requestKey: uuid, renewalDraftId: uuid, expectedVersion: z.number().int().positive().safe(), startsOn: date, endsOn: date, priceCents: price, assigneeId: z.string().trim().max(100).default(''), reminderAt: instant, reason, reviewAttested: z.literal(true) }).strict().refine(d => d.startsOn <= d.endsOn, 'End date must not precede start date.');

export function createAgreementRenewal({ db, repo, get }) {
    function replay(user, key, fingerprint) {
        const prior = repo.prior(key);
        if (!prior)
            return null;
        if (prior.actor_id !== user.id)
            fail('This request belongs to another account.', 403);
        if (prior.request_hash !== fingerprint)
            fail('Request key has different renewal content.', 409);
        return JSON.parse(prior.result_json);
    }
    function renew(user, sourceId, raw) {
        writer(user);
        parse(uuid, sourceId);
        const d = parse(input, raw), fingerprint = hash({ action: 'renew_agreement', agreementId: sourceId, ...d });
        return repo.within(() => {
            const previous = replay(user, d.requestKey, fingerprint);
            if (previous)
                return previous;
            const source = get(sourceId);
            if (source.version !== d.expectedVersion)
                fail('Agreement changed. Reload before renewing.', 409);
            if (!repo.activation(sourceId))
                fail('Renew only an authorized agreement. Operational authorization is required first.', 409);
            if (repo.head(d.renewalDraftId))
                fail('The renewal draft identity already exists.', 409);
            const renewalDocument = { ...source.document, id: d.renewalDraftId, startsOn: d.startsOn, endsOn: d.endsOn, priceCents: d.priceCents, renewalPolicy: 'manual_review', archived: false };
            repo.validateCoverage(renewalDocument);
            repo.save(renewalDocument, user, d.reason);
            db.prepare('INSERT INTO _agreement_renewals(id,source_agreement_id,renewal_agreement_id,source_version,actor_id,reason,assignee_id,reminder_at) VALUES(?,?,?,?,?,?,?,?)').run(d.id, sourceId, d.renewalDraftId, source.version, user.id, d.reason, d.assigneeId, d.reminderAt ?? null);
            const result = { renewal: { id: d.id, sourceAgreementId: sourceId, renewalAgreementId: d.renewalDraftId, sourceVersion: source.version, status: 'draft', assigneeId: d.assigneeId, reminderAt: d.reminderAt ?? null }, communicationSent: false, workGenerated: false };
            repo.acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }
    function history(user, agreementId) {
        reader(user);
        parse(uuid, agreementId);
        return repo.within(() => {
            get(agreementId);
            return { rows: db.prepare('SELECT id,source_agreement_id AS sourceAgreementId,renewal_agreement_id AS renewalAgreementId,source_version AS sourceVersion,actor_id AS actorId,reason,assignee_id AS assigneeId,reminder_at AS reminderAt,created_at AS createdAt FROM _agreement_renewals WHERE source_agreement_id=? ORDER BY created_at DESC,id').all(agreementId).map(row => ({ ...row })) };
        });
    }
    return { renew, history };
}
