import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { owner, member } from './fixtures/service-execution.mjs';
import { agreementLifecycleFixture as fixture } from './helpers/agreement-lifecycle-fixture.mjs';
const reason = 'Reviewed exact maintenance plan and operational generation';
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
const plan = (f, patch = {}) => ({ id: randomUUID(), requestKey: randomUUID(), expectedVersion: 0, title: 'Quarterly inspection', description: 'Inspect selected native equipment', frequency: 'monthly', firstDue: '2027-01-15', horizonDays: 90, seasonalMonths: [], checklist: [{ label: 'Inspect belts', required: true }, { label: 'Record readings', required: false }], assetIds: [f.draft.assetIds[0]], archived: false, reason, reviewAttested: true, ...patch });

test('maintenance plans retain immutable revisions and enforce agreement equipment scope', t => {
    const f = fixture(t);
    const first = plan(f);
    const saved = f.a.maintenance.save(owner, f.draft.id, first);
    assert.equal(saved.plan.version, 1);
    assert.equal(saved.plan.frequency, 'monthly');
    assert.equal(saved.plan.assets.length, 1);
    assert.equal(saved.plan.checklist[0].label, 'Inspect belts');
    assert.equal(saved.workGenerated, false);
    const update = { ...first, requestKey: randomUUID(), expectedVersion: 1, checklist: [{ label: 'Also test safeties', required: true }] };
    const rev2 = f.a.maintenance.save(owner, f.draft.id, update);
    assert.equal(rev2.plan.version, 2);
    assert.equal(f.a.maintenance.history(owner, f.draft.id, saved.plan.id).rows.length, 2);
    assert.deepEqual(f.a.maintenance.save(owner, f.draft.id, update), rev2);
    const other = randomUUID();
    f.db.prepare("INSERT INTO assets(id,customer_id,site_id,name,serial_number) VALUES(?,?,?,'Unlisted','U1')").run(other, f.draft.customerId, f.draft.siteIds[0]);
    assert.throws(() => f.a.maintenance.save(owner, f.draft.id, { ...plan(f), assetIds: [other] }), /selected scope/);
    assert.throws(() => f.a.maintenance.save(member, f.draft.id, plan(f)));
});

test('due preview lists occurrences only while the authorized term is active and equipment is in accepted scope', t => {
    const f = authorized(t);
    f.a.maintenance.save(owner, f.draft.id, plan(f));
    const preview = f.a.maintenance.preview(owner, f.draft.id, { from: '2027-01-01', to: '2027-03-31' });
    assert.deepEqual(preview.due.map(x => x.dueOn), ['2027-01-15', '2027-02-15', '2027-03-15']);
    assert.equal(preview.blocked.length, 0);
    const g = accepted(t);
    g.a.maintenance.save(owner, g.draft.id, plan(g));
    const pending = g.a.maintenance.preview(owner, g.draft.id, { from: '2027-01-01', to: '2027-01-31' });
    assert.equal(pending.due.length, 0);
    assert.equal(pending.blocked.length, 1);
    assert.match(pending.blocked[0].blockedReason, /authorization/);
});

test('generation creates one native PM job per occurrence exactly once', t => {
    const f = authorized(t);
    f.a.maintenance.save(owner, f.draft.id, plan(f));
    const before = f.db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n;
    const cmd = { id: randomUUID(), requestKey: randomUUID(), from: '2027-01-01', to: '2027-01-31', reason, reviewAttested: true };
    const result = f.a.maintenance.generate(owner, f.draft.id, cmd);
    assert.equal(result.generated.length, 1);
    assert.equal(result.generated[0].dueOn, '2027-01-15');
    assert.equal(result.generated[0].job.workCategory, 'pm');
    assert.equal(result.generated[0].job.assigned, false);
    const job = f.db.prepare('SELECT scheduled_date,technician_id FROM jobs WHERE id=?').get(result.generated[0].job.id);
    assert.equal(job.scheduled_date, '2027-01-15');
    assert.equal(job.technician_id, null);
    assert.equal(f.db.prepare('SELECT category FROM _service_work WHERE job_id=?').get(result.generated[0].job.id).category, 'pm');
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n, before + 1);
    assert.deepEqual(f.a.maintenance.generate(owner, f.draft.id, cmd), result);
    const again = f.a.maintenance.generate(owner, f.draft.id, { ...cmd, id: randomUUID(), requestKey: randomUUID() });
    assert.equal(again.generated.length, 0);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n, before + 1);
});

test('an auditable skip removes one occurrence without creating a job', t => {
    const f = authorized(t);
    const p = f.a.maintenance.save(owner, f.draft.id, plan(f));
    const jobs = f.db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n;
    const skip = { id: randomUUID(), requestKey: randomUUID(), planId: p.plan.id, assetId: f.draft.assetIds[0], dueOn: '2027-02-15', reason, reviewAttested: true };
    assert.equal(f.a.maintenance.skip(owner, f.draft.id, skip).skipped, true);
    assert.deepEqual(f.a.maintenance.preview(owner, f.draft.id, { from: '2027-01-01', to: '2027-03-31' }).due.map(x => x.dueOn), ['2027-01-15', '2027-03-15']);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n, jobs);
    assert.throws(() => f.a.maintenance.skip(owner, f.draft.id, { ...skip, id: randomUUID(), requestKey: randomUUID() }), /already generated or skipped/);
    assert.throws(() => f.a.maintenance.skip(owner, f.draft.id, { ...skip, id: randomUUID(), requestKey: randomUUID(), dueOn: '2027-02-16' }), /not a scheduled occurrence/);
});

test('late acknowledgment failure rolls back jobs and due work; roles and moved equipment are blocked', t => {
    const f = authorized(t);
    f.a.maintenance.save(owner, f.draft.id, plan(f));
    const jobs = f.db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n;
    const cmd = { id: randomUUID(), requestKey: randomUUID(), from: '2027-01-01', to: '2027-01-31', reason, reviewAttested: true };
    f.db.exec("CREATE TRIGGER qa_maint_ack BEFORE INSERT ON _agreement_draft_requests BEGIN SELECT RAISE(ABORT,'QA_MAINT_LATE'); END;");
    assert.throws(() => f.a.maintenance.generate(owner, f.draft.id, cmd), /QA_MAINT_LATE/);
    f.db.exec('DROP TRIGGER qa_maint_ack');
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n, jobs);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM _agreement_due_work').get().n, 0);
    assert.throws(() => f.a.maintenance.generate(member, f.draft.id, { ...cmd, id: randomUUID(), requestKey: randomUUID() }));
    const site = randomUUID();
    f.db.prepare('INSERT INTO sites(id,customer_id,name) VALUES(?,?,?)').run(site, f.draft.customerId, 'Moved');
    f.db.prepare('UPDATE assets SET site_id=? WHERE id=?').run(site, f.draft.assetIds[0]);
    const blocked = f.a.maintenance.preview(owner, f.draft.id, { from: '2027-01-01', to: '2027-01-31' });
    assert.equal(blocked.due.length, 0);
    assert.match(blocked.blocked[0].blockedReason, /ownership or location/);
});

test('seasonal months restrict occurrences to the configured season', t => {
    const f = authorized(t);
    f.a.maintenance.save(owner, f.draft.id, plan(f, { seasonalMonths: [1, 3] }));
    assert.deepEqual(f.a.maintenance.preview(owner, f.draft.id, { from: '2027-01-01', to: '2027-05-31' }).due.map(x => x.dueOn), ['2027-01-15', '2027-03-15']);
});

test('due dates falling on closed days shift to the next business day', t => {
    const f = authorized(t);
    f.a.maintenance.save(owner, f.draft.id, plan(f, { firstDue: '2027-01-16' }));
    f.db.prepare('UPDATE _dispatch_operating_settings SET enabled=1 WHERE id=1').run();
    const preview = f.a.maintenance.preview(owner, f.draft.id, { from: '2027-01-01', to: '2027-02-28' });
    assert.deepEqual(preview.due.map(x => x.dueOn), ['2027-01-18', '2027-02-16']);
    // A skipped occurrence uses the shifted date.
    const skip = { id: randomUUID(), requestKey: randomUUID(), planId: preview.due[0].planId, assetId: f.draft.assetIds[0], dueOn: '2027-01-18', reason, reviewAttested: true };
    assert.equal(f.a.maintenance.skip(owner, f.draft.id, skip).skipped, true);
    assert.throws(() => f.a.maintenance.skip(owner, f.draft.id, { ...skip, id: randomUUID(), requestKey: randomUUID(), dueOn: '2027-01-16' }), /not a scheduled occurrence/);
});

test('plans retain required completion evidence and carry it onto generated jobs', t => {
    const f = authorized(t);
    const saved = f.a.maintenance.save(owner, f.draft.id, plan(f, { requiredEvidence: ['photo', 'reading'] }));
    assert.deepEqual(saved.plan.requiredEvidence, ['photo', 'reading']);
    assert.throws(() => f.a.maintenance.save(owner, f.draft.id, { ...plan(f), requiredEvidence: ['photo', 'photo'] }), /must not repeat/);
    f.setTime('2027-01-01T15:00:00Z');
    const result = f.a.maintenance.generate(owner, f.draft.id, { id: randomUUID(), requestKey: randomUUID(), from: '2027-01-01', to: '2027-01-31', reason, reviewAttested: true });
    assert.equal(result.generated.length, 1);
    const job = f.db.prepare('SELECT notes FROM jobs WHERE id=?').get(result.generated[0].job.id);
    assert.match(job.notes, /Required evidence/);
    assert.match(job.notes, /photo/);
    assert.match(job.notes, /reading/);
});
