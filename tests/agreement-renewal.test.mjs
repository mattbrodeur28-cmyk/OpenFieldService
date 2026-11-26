import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { owner } from './fixtures/service-execution.mjs';
import { agreementLifecycleFixture as fixture } from './helpers/agreement-lifecycle-fixture.mjs';
const reason = 'Reviewed exact renewal term and pricing';
function accepted(t) {
    const f = fixture(t);
    f.a.lifecycle.offer(owner, f.draft.id, f.offer());
    f.setTime('2026-11-25T14:01:00Z');
    f.a.lifecycle.record(owner, f.draft.id, f.response('delivered'));
    f.setTime('2026-11-25T14:02:00Z');
    f.a.lifecycle.record(owner, f.draft.id, f.response('accepted'));
    return f;
}
function authorized(t) {
    const f = accepted(t);
    const offer = f.a.activation.summary(owner, f.draft.id).acceptedOffer;
    f.a.activation.authorize(owner, f.draft.id, { id: randomUUID(), requestKey: randomUUID(), offerId: offer.id, expectedAcceptanceSequence: offer.acceptanceSequence, expectedSnapshotHash: offer.snapshotHash, expectedPdfHash: offer.pdfHash, reason, reviewAttested: true });
    return f;
}

test('renewal creates a linked renewal draft from an authorized agreement', t => {
    const f = authorized(t);
    const source = f.a.detail(owner, f.draft.id).agreement;
    const command = { id: randomUUID(), requestKey: randomUUID(), renewalDraftId: randomUUID(), expectedVersion: source.version, startsOn: '2028-01-01', endsOn: '2028-12-31', priceCents: 12000, reason, reviewAttested: true };
    const result = f.a.renewal.renew(owner, f.draft.id, command);
    assert.equal(result.renewal.status, 'draft');
    assert.equal(result.renewal.sourceAgreementId, f.draft.id);
    const draft = f.a.detail(owner, command.renewalDraftId);
    assert.equal(draft.agreement.document.startsOn, '2028-01-01');
    assert.equal(draft.agreement.document.endsOn, '2028-12-31');
    assert.equal(draft.agreement.document.priceCents, 12000);
    assert.equal(draft.agreement.document.customerId, f.draft.customerId);
    assert.equal(draft.agreement.document.siteIds.length, 1);
    assert.equal(draft.agreement.document.assetIds.length, 1);
    assert.deepEqual(f.a.renewal.renew(owner, f.draft.id, command), result);
    assert.equal(f.a.renewal.history(owner, f.draft.id).rows.length, 1);
});

test('renewal requires authorization and rejects stale, invalid or duplicate drafts', t => {
    const pending = accepted(t);
    const source = pending.a.detail(owner, pending.draft.id).agreement;
    const command = { id: randomUUID(), requestKey: randomUUID(), renewalDraftId: randomUUID(), expectedVersion: source.version, startsOn: '2028-01-01', endsOn: '2028-12-31', priceCents: 12000, reason, reviewAttested: true };
    assert.throws(() => pending.a.renewal.renew(owner, pending.draft.id, command), /authorized/);
    const f = authorized(t);
    const v = f.a.detail(owner, f.draft.id).agreement;
    assert.throws(() => f.a.renewal.renew(owner, f.draft.id, { ...command, expectedVersion: 999 }), /changed/);
    assert.throws(() => f.a.renewal.renew(owner, f.draft.id, { ...command, expectedVersion: v.version, startsOn: '2028-12-31', endsOn: '2028-01-01' }), /End date/);
    const done = f.a.renewal.renew(owner, f.draft.id, { ...command, expectedVersion: v.version });
    assert.throws(() => f.a.renewal.renew(owner, f.draft.id, { ...command, id: randomUUID(), requestKey: randomUUID(), renewalDraftId: done.renewal.renewalAgreementId, expectedVersion: v.version }), /identity already exists/);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM _agreement_drafts').get().n, 2);
    assert.throws(() => f.db.prepare('UPDATE _agreement_renewals SET reason=?').run('x'), /IMMUTABLE/);
});
