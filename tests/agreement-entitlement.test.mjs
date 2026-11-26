import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { owner } from './fixtures/service-execution.mjs';
import { agreementLifecycleFixture as fixture } from './helpers/agreement-lifecycle-fixture.mjs';
const reason = 'Reviewed exact accepted source and entitlement terms';
function accepted(t) {
    const f = fixture(t);
    f.a.lifecycle.offer(owner, f.draft.id, f.offer());
    f.setTime('2026-11-25T14:01:00Z');
    f.a.lifecycle.record(owner, f.draft.id, f.response('delivered'));
    f.setTime('2026-11-25T14:02:00Z');
    f.a.lifecycle.record(owner, f.draft.id, f.response('accepted'));
    return f;
}
function authorized(t, entitlements = {}) {
    const f = accepted(t);
    const offer = f.a.activation.summary(owner, f.draft.id).acceptedOffer;
    f.a.activation.authorize(owner, f.draft.id, { id: randomUUID(), requestKey: randomUUID(), offerId: offer.id, expectedAcceptanceSequence: offer.acceptanceSequence, expectedSnapshotHash: offer.snapshotHash, expectedPdfHash: offer.pdfHash, reason, reviewAttested: true, ...entitlements });
    return f;
}
function evidence(f, { startAt, endAt, workedMinutes, assetId = f.draft.assetIds[0], jobId }) {
    const customerId = f.draft.customerId;
    jobId = jobId ?? f.db.prepare('SELECT id FROM jobs WHERE customer_id=? AND asset_id=? ORDER BY created_at,id LIMIT 1').get(customerId, assetId).id;
    const tpl = f.db.prepare('SELECT template_id,revision FROM _service_safety_templates LIMIT 1').get();
    f.db.prepare("INSERT OR IGNORE INTO _service_execution(job_id,template_id,template_revision,stage,service_completed,version,estimate_json,enrolled_by) VALUES(?,?,?,?,?,?,?,?)").run(jobId, tpl.template_id, tpl.revision, 'complete', 1, 1, '{}', owner.id);
    const revision = f.db.prepare('SELECT COALESCE(MAX(revision),0)+1 AS n FROM _service_reports WHERE job_id=?').get(jobId).n;
    const reportId = randomUUID();
    f.db.prepare("INSERT INTO _service_reports(id,job_id,revision,report_json,visit_start_at,visit_end_at,actor_id,technician_id,delegation_reason,late_entry_reason,asset_id,equipment_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(reportId, jobId, revision, '{}', startAt, endAt, owner.id, f.tech, '', '', assetId, '{}');
    f.db.prepare("INSERT INTO _service_report_reviews(id,report_id,decision,notes,actor_id) VALUES(?,?,?,?,?)").run(randomUUID(), reportId, 'approved', 'Reviewed entitlement evidence', owner.id);
    f.db.prepare("INSERT INTO _service_time_entries(id,report_id,job_id,technician_id,start_at,end_at,break_minutes,worked_minutes,requested_billable_minutes,work_type,notes,actor_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(randomUUID(), reportId, jobId, f.tech, startAt, endAt, 0, workedMinutes, workedMinutes, 'work', '', owner.id);
    f.db.prepare("UPDATE _service_time_entries SET state='approved' WHERE report_id=?").run(reportId);
    return { reportId, jobId };
}

test('entitlement configuration is unknown unless reviewed at authorization', t => {
    const f = authorized(t);
    const e = f.a.activation.entitlement(owner, f.draft.id);
    assert.equal(e.configured.includedVisits, null);
    assert.equal(e.configured.includedHours, null);
    assert.equal(e.configured.responsePriority, null);
    assert.equal(e.billingEntitlement, false);
    assert.equal(e.consumed.visits, 0);
    assert.equal(e.consumed.hours, 0);
    const g = authorized(t, { includedVisits: 2, includedHours: 120, responsePriority: 'priority' });
    const ge = g.a.activation.entitlement(owner, g.draft.id);
    assert.equal(ge.configured.includedVisits, 2);
    assert.equal(ge.configured.includedHours, 120);
    assert.equal(ge.configured.responsePriority, 'priority');
});

test('entitlement consumes approved in-scope visits and hours only during the active term', t => {
    const f = authorized(t, { includedVisits: 2, includedHours: 120 });
    f.setTime('2027-01-10T15:00:00Z');
    let e = f.a.activation.entitlement(owner, f.draft.id);
    assert.equal(e.consumed.visits, 0);
    assert.equal(e.consumed.hours, 0);
    evidence(f, { startAt: '2027-01-10T14:00:00Z', endAt: '2027-01-10T15:00:00Z', workedMinutes: 50 });
    e = f.a.activation.entitlement(owner, f.draft.id);
    assert.equal(e.consumed.visits, 1);
    assert.equal(e.consumed.hours, 50);
    assert.deepEqual(e.remaining, { visits: 1, hours: 70 });
    assert.equal(e.visitsExhausted, false);
    assert.equal(e.hoursExhausted, false);
    assert.equal(e.billingEntitlement, true);
    const cov = f.a.activation.coverage(owner, f.draft.id, { assetId: f.draft.assetIds[0], date: '2027-01-10' });
    assert.equal(cov.scopeEligible, true);
    assert.equal(cov.billingEntitlement, true);
    assert.equal(cov.includedVisits, 2);
    assert.equal(cov.includedHours, 120);
});

test('entitlement reports exhaustion and flips coverage to billable exceptions', t => {
    const f = authorized(t, { includedVisits: 1, includedHours: 60 });
    f.setTime('2027-02-10T15:00:00Z');
    evidence(f, { startAt: '2027-01-10T14:00:00Z', endAt: '2027-01-10T15:00:00Z', workedMinutes: 50 });
    evidence(f, { startAt: '2027-02-10T14:00:00Z', endAt: '2027-02-10T15:00:00Z', workedMinutes: 50 });
    const e = f.a.activation.entitlement(owner, f.draft.id);
    assert.equal(e.consumed.visits, 2);
    assert.equal(e.consumed.hours, 100);
    assert.deepEqual(e.remaining, { visits: 0, hours: 0 });
    assert.equal(e.visitsExhausted, true);
    assert.equal(e.hoursExhausted, true);
    assert.equal(e.billingEntitlement, false);
    assert.equal(e.detail.length, 2);
    const cov = f.a.activation.coverage(owner, f.draft.id, { assetId: f.draft.assetIds[0], date: '2027-02-10' });
    assert.equal(cov.scopeEligible, true);
    assert.equal(cov.billingEntitlement, false);
});

test('out-of-term and unselected-equipment evidence is never consumed', t => {
    const f = authorized(t, { includedVisits: 5, includedHours: 500 });
    const other = randomUUID();
    f.db.prepare("INSERT INTO assets(id,customer_id,site_id,name,serial_number) VALUES(?,?,?,'Unlisted','U2')").run(other, f.draft.customerId, f.draft.siteIds[0]);
    const jobId = randomUUID();
    f.db.prepare("INSERT INTO jobs(id,identifier,customer_id,asset_id,scheduled_date) VALUES(?,?,?,?,'2027-01-10')").run(jobId, 'ENT-' + jobId.slice(0, 8), f.draft.customerId, other);
    evidence(f, { startAt: '2027-01-10T14:00:00Z', endAt: '2027-01-10T15:00:00Z', workedMinutes: 50, assetId: other, jobId });
    const e = f.a.activation.entitlement(owner, f.draft.id);
    assert.equal(e.consumed.visits, 0);
    assert.equal(e.consumed.hours, 0);
    assert.equal(e.detail.length, 0);
});

test('profitability projects contract value and net material cost with explicit unknowns', t => {
    const f = authorized(t);
    f.setTime('2027-01-10T15:00:00Z');
    const job = randomUUID();
    f.db.prepare("INSERT INTO jobs(id,identifier,customer_id,asset_id,scheduled_date) VALUES(?,?,?,?,'2027-01-10')").run(job, 'PM-' + job.slice(0, 8), f.draft.customerId, f.draft.assetIds[0]);
    const material = randomUUID();
    f.db.prepare('INSERT INTO materials(id,name) VALUES(?,?)').run(material, 'Filter');
    f.db.prepare("INSERT INTO _inventory_movements(id,request_key,request_hash,actor_id,kind,material_id,quantity_milli,value_millicents,job_id,technician_id,reason,delegation_reason,before_json,after_json) VALUES(?,?,?,?,?,?,?,?,?,NULL,?,?,?,?)")
        .run(randomUUID(), randomUUID(), 'x', owner.id, 'usage', material, 1000, '50000', job, 'Used on PM', '', '{}', '{}');
    const p = f.a.activation.profitability(owner, f.draft.id);
    assert.equal(p.contractValueCents, 10000);
    assert.equal(p.materialCostCents, 50);
    assert.equal(p.laborCostCents, null);
    assert.equal(p.marginCents, null);
    assert.equal(p.allocation.length, 1);
    assert.equal(p.allocation[0].costCents, 50);
});

test('profitability applies a reviewed labor rate to approved in-scope work', t => {
    const f = authorized(t);
    f.setTime('2027-01-10T15:00:00Z');
    f.a.labor.save(owner, { expectedVersion: 0, rateCentsPerHour: 6000, reason, reviewAttested: true });
    assert.equal(f.a.labor.current(owner).rateCentsPerHour, 6000);
    assert.throws(() => f.a.labor.save(owner, { expectedVersion: 0, rateCentsPerHour: 7000, reason, reviewAttested: true }), /changed/);
    // 50 approved minutes on an in-scope job, then material cost 50 cents.
    const job = randomUUID();
    f.db.prepare("INSERT INTO jobs(id,identifier,customer_id,asset_id,scheduled_date) VALUES(?,?,?,?,'2027-01-10')").run(job, 'PM-' + job.slice(0, 8), f.draft.customerId, f.draft.assetIds[0]);
    evidence(f, { startAt: '2027-01-10T14:00:00Z', endAt: '2027-01-10T15:00:00Z', workedMinutes: 50, jobId: job });
    const material = randomUUID();
    f.db.prepare('INSERT INTO materials(id,name) VALUES(?,?)').run(material, 'Filter');
    f.db.prepare("INSERT INTO _inventory_movements(id,request_key,request_hash,actor_id,kind,material_id,quantity_milli,value_millicents,job_id,technician_id,reason,delegation_reason,before_json,after_json) VALUES(?,?,?,?,?,?,?,?,?,NULL,?,?,?,?)")
        .run(randomUUID(), randomUUID(), 'x', owner.id, 'usage', material, 1000, '50000', job, 'Used on PM', '', '{}', '{}');
    const p = f.a.activation.profitability(owner, f.draft.id);
    assert.equal(p.laborMinutes, 50);
    assert.equal(p.laborRateCentsPerHour, 6000);
    assert.equal(p.laborCostCents, 5000);
    assert.equal(p.materialCostCents, 50);
    assert.equal(p.marginCents, 10000 - 50 - 5000);
});
