import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStorage } from "../src/server/sqlite.mjs";
import { createDispatcher } from "../src/server/dispatch/service.mjs";
import { createService } from "../src/server/service/http.mjs";
import { createPostWork } from "../src/server/service/reports.mjs";
import { validateReport } from "../src/server/service/report-domain.mjs";
const owner = { id: randomUUID(), role: "owner", active: true },
  member = { id: randomUUID(), role: "member", active: true },
  other = { id: randomUUID(), role: "member", active: true },
  hr = { id: randomUUID(), role: "member", active: true, hr: true };
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "ofs-reports-")),
    storage = openStorage(join(dir, "service.sqlite")),
    db = storage.database,
    tech = randomUUID(),
    customer = randomUUID();
  db.prepare("INSERT INTO technicians(id,name) VALUES(?,?)").run(
    tech,
    "Mapped technician",
  );
  db.prepare("INSERT INTO customers(id,name) VALUES(?,?)").run(
    customer,
    "Shared customer",
  );
  const dispatch = createDispatcher({
    storage,
    currentUser: () => owner,
    env: { DISPATCH_TIMEZONE: "America/New_York" },
  });
  const module = createService({
    storage,
    currentUser: () => owner,
    people: () =>
      [owner, member, other, hr].map((u) => ({ id: u.id, name: u.role })),
  });
  module.service.save(owner, tech, { userId: member.id, expectedVersion: 0 });
  const template = module.execution.saveTemplate(owner, {
    expectedRevision: 0,
    name: "Test PJSA",
    questions: [
      { key: "ack", label: "Company review", kind: "ack", required: true },
    ],
    approvedForUse: true,
  });
  const now = new Date(Date.now() + 86400000);
  const reports = createPostWork({
    storage,
    identity: module.service,
    safety: module.execution,
    clock: () => now,
  });
  const site = randomUUID(),
    asset = randomUUID();
  db.prepare("INSERT INTO sites(id,customer_id,name) VALUES(?,?,?)").run(
    site,
    customer,
    "Test building",
  );
  db.prepare(
    "INSERT INTO assets(id,customer_id,site_id,name,serial_number) VALUES(?,?,?,?,?)",
  ).run(asset, customer, site, "Test controller", "TEST-SERIAL");
  const newJob = () => {
    const id = randomUUID();
    db.prepare(
      "INSERT INTO jobs(id,identifier,customer_id,technician_id,asset_id,scheduled_date,scheduled_time,duration) VALUES(?,?,?,?,?,'2026-11-16','09:00',60)",
    ).run(id, "REPORT-" + id, customer, tech, asset);
    module.execution.enroll(owner, id, {
      templateId: template.template_id,
      templateRevision: 1,
      expectedScheduleVersion: 0,
    });
    module.execution.safety(
      member,
      id,
      { expectedVersion: 0, answers: { ack: true } },
      true,
    );
    return id;
  };
  const id = newJob(),
    start = new Date(
      Math.ceil(Date.now() / 60000) * 60000 + 300000,
    ).toISOString(),
    end = new Date(Date.parse(start) + 90 * 60000).toISOString();
  const report = {
    timeZone: "America/New_York",
    workPerformed: "Completed the controls inspection and recorded findings.",
    findings: "Equipment readings saved.",
    deficiencies: "Follow-up needed.",
    followUp: "Arrange the next visit.",
    visitStartAt: start,
    visitEndAt: end,
    entries: [
      {
        technicianId: tech,
        startAt: start,
        endAt: end,
        breakMinutes: 15,
        requestedBillableMinutes: 60,
        workType: "work",
        notes: "Actual work and break record",
      },
    ],
  };
  t.after(() => {
    dispatch.close();
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    dispatch,
    db,
    storage,
    tech,
    customer,
    asset,
    module,
    reports,
    id,
    newJob,
    report,
    now,
  };
}
test("Post-work draft, immutable submission, labor and completion review share the original job", (t) => {
  const f = fixture(t);
  const draft = f.reports.save(member, f.id, {
    expectedVersion: 1,
    report: f.report,
  });
  assert.equal(draft.workflow.version, 2);
  assert.equal(draft.reportDraft.report.workPerformed, f.report.workPerformed);
  const submitted = f.reports.save(
    member,
    f.id,
    { expectedVersion: 2, report: f.report },
    true,
  );
  assert.equal(submitted.workflow.stage, "review");
  assert.equal(submitted.reports[0].revision, 1);
  assert.equal(submitted.timeEntries[0].worked_minutes, 75);
  assert.equal(submitted.timeEntries[0].requested_billable_minutes, 60);
  assert.equal(submitted.job.status, "in_progress");
  assert.equal(submitted.reportDraft, null);
  assert.throws(
    () =>
      f.db.prepare("UPDATE jobs SET status='completed' WHERE id=?").run(f.id),
    /SERVICE_REPORT_REQUIRED/,
  );
  const approved = f.reports.review(owner, f.id, {
    expectedVersion: 3,
    reportId: submitted.reports[0].id,
    decision: "approved",
    notes: "Reviewed work and time evidence.",
  });
  assert.equal(approved.job.status, "completed");
  assert.equal(approved.workflow.service_completed, 1);
  assert.equal(
    approved.workflow.stage,
    "review",
    "Billing review remains separate",
  );
  assert.equal(approved.timeEntries[0].state, "approved");
  assert.equal(
    f.db.prepare("SELECT duration FROM jobs WHERE id=?").get(f.id).duration,
    60,
    "Estimate is retained rather than overwritten by actual elapsed 90 minutes",
  );
  assert.throws(
    () =>
      f.db
        .prepare(
          "INSERT INTO invoices(identifier,customer_id,job_id) VALUES(?,?,?)",
        )
        .run("TOO-SOON", f.customer, f.id),
    /SERVICE_BILLING_REVIEW/,
  );
  assert.throws(
    () =>
      f.db
        .prepare("UPDATE _service_reports SET report_json=? WHERE job_id=?")
        .run("{}", f.id),
    /IMMUTABLE/,
  );
  assert.throws(
    () =>
      f.db
        .prepare(
          "UPDATE _service_time_entries SET worked_minutes=1 WHERE job_id=?",
        )
        .run(f.id),
    /IMMUTABLE/,
  );
  assert.throws(
    () =>
      f.reports.review(owner, f.id, {
        expectedVersion: 4,
        reportId: submitted.reports[0].id,
        decision: "approved",
        notes: "Repeated review",
      }),
    /changed/,
  );
});
test("Returned reports retain prior evidence and rejected time is replaced only by a new submitted revision", (t) => {
  const f = fixture(t);
  let state = f.reports.save(
    member,
    f.id,
    { expectedVersion: 1, report: f.report },
    true,
  );
  state = f.reports.review(owner, f.id, {
    expectedVersion: 2,
    reportId: state.reports[0].id,
    decision: "rejected",
    notes: "Add the missing follow-up detail.",
  });
  assert.equal(state.workflow.stage, "post_work");
  assert.equal(state.timeEntries[0].state, "rejected");
  assert.equal(state.reports[0].decision, "rejected");
  state = f.reports.save(
    member,
    f.id,
    {
      expectedVersion: 3,
      report: { ...f.report, followUp: "Corrected and reviewed follow-up." },
    },
    true,
  );
  assert.equal(state.reports.length, 2);
  assert.equal(state.reports[0].revision, 2);
  assert.equal(
    state.timeEntries.filter((t) => t.state === "submitted").length,
    1,
  );
  assert.equal(
    state.timeEntries.filter((t) => t.state === "rejected").length,
    1,
  );
  assert.throws(
    () =>
      f.reports.save(
        member,
        f.id,
        { expectedVersion: 3, report: f.report },
        true,
      ),
    /changed/,
  );
});
test("Technician time overlaps and failed audit writes roll back report, ledger and workflow together", (t) => {
  const f = fixture(t);
  f.reports.save(member, f.id, { expectedVersion: 1, report: f.report }, true);
  const next = f.newJob();
  assert.throws(
    () =>
      f.reports.save(
        member,
        next,
        { expectedVersion: 1, report: f.report },
        true,
      ),
    /SERVICE_TIME_OVERLAP/,
  );
  assert.equal(f.reports.detail(member, next).reports.length, 0);
  assert.equal(f.reports.detail(member, next).workflow.version, 1);
  const shifted = {
    ...f.report,
    visitStartAt: new Date(
      Date.parse(f.report.visitEndAt) + 60000,
    ).toISOString(),
    visitEndAt: new Date(
      Date.parse(f.report.visitEndAt) + 31 * 60000,
    ).toISOString(),
  };
  shifted.entries = [
    {
      ...f.report.entries[0],
      startAt: shifted.visitStartAt,
      endAt: shifted.visitEndAt,
      breakMinutes: 0,
      requestedBillableMinutes: 20,
    },
  ];
  f.db.exec(
    "CREATE TRIGGER fail_report_audit BEFORE INSERT ON _service_execution_audit WHEN NEW.action='report_submitted' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END",
  );
  assert.throws(
    () =>
      f.reports.save(
        member,
        next,
        { expectedVersion: 1, report: shifted },
        true,
      ),
    /audit unavailable/,
  );
  assert.equal(f.reports.detail(member, next).reports.length, 0);
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM _service_time_entries").get().n,
    1,
  );
});
test("Post-work permissions, real minute intervals, breaks, billing requests and late-entry review are explicit", (t) => {
  const f = fixture(t);
  for (const user of [other, hr, { ...member, active: false }])
    assert.throws(
      () =>
        f.reports.save(
          user,
          f.id,
          { expectedVersion: 1, report: f.report },
          true,
        ),
      /required|cannot submit/,
    );
  assert.throws(
    () =>
      f.reports.save(
        owner,
        f.id,
        { expectedVersion: 1, report: f.report },
        true,
      ),
    /required/,
  );
  for (const patch of [
    { workPerformed: "" },
    { visitEndAt: f.report.visitStartAt },
    { entries: [{ ...f.report.entries[0], requestedBillableMinutes: 90 }] },
    { entries: [{ ...f.report.entries[0], workType: "nonbillable" }] },
    { entries: [{ ...f.report.entries[0], technicianId: randomUUID() }] },
    { entries: [f.report.entries[0], f.report.entries[0]] },
    { timeZone: "invalid/timezone" },
  ])
    assert.throws(() =>
      f.reports.save(
        member,
        f.id,
        { expectedVersion: 1, report: { ...f.report, ...patch } },
        true,
      ),
    );
  const pastStart = new Date(
      Date.parse(f.report.visitStartAt) - 86400000,
    ).toISOString(),
    pastEnd = new Date(Date.parse(pastStart) + 60 * 60000).toISOString(),
    past = {
      ...f.report,
      visitStartAt: pastStart,
      visitEndAt: pastEnd,
      entries: [
        {
          ...f.report.entries[0],
          startAt: pastStart,
          endAt: pastEnd,
          breakMinutes: 0,
        },
      ],
    };
  assert.throws(
    () =>
      f.reports.save(member, f.id, { expectedVersion: 1, report: past }, true),
    /predates/,
  );
  const submitted = f.reports.save(
    owner,
    f.id,
    {
      expectedVersion: 1,
      report: past,
      delegationReason: "Supervisor transcribing a paper record",
      lateEntryReason:
        "Reviewed the late entry against retained paper evidence",
    },
    true,
  );
  assert.equal(
    submitted.reports[0].late_entry_reason,
    "Reviewed the late entry against retained paper evidence",
  );
  assert.throws(
    () =>
      f.reports.review(hr, f.id, {
        expectedVersion: 2,
        reportId: submitted.reports[0].id,
        decision: "approved",
        notes: "HR is not a service approver",
      }),
    /administrator/,
  );
});
test("Actual time preserves UTC instants through cross-midnight and daylight-saving intervals", () => {
  const start = "2026-11-01T05:30:00.000Z",
    end = "2026-11-01T07:30:00.000Z",
    tech = randomUUID();
  const report = {
    workPerformed: "Actual DST visit",
    visitStartAt: start,
    visitEndAt: end,
    entries: [
      {
        technicianId: tech,
        startAt: start,
        endAt: end,
        breakMinutes: 15,
        requestedBillableMinutes: 90,
        workType: "work",
      },
    ],
  };
  assert.equal(
    validateReport(report, tech, new Date("2026-11-02T00:00:00Z")),
    120,
  );
  assert.throws(
    () => validateReport(report, tech, new Date("2026-11-01T06:00:00Z")),
    /finished actual visit/,
  );
});

test("Approved actual visits replace planned Dispatcher slots and split midnight without mutating source estimates", async (t) => {
  const f = fixture(t);
  const start = "2026-11-11T04:30:00.000Z",
    end = "2026-11-11T06:30:00.000Z";
  const report = {
    ...f.report,
    visitStartAt: start,
    visitEndAt: end,
    entries: [{ ...f.report.entries[0], startAt: start, endAt: end }],
  };
  const sent = f.reports.save(
    owner,
    f.id,
    {
      expectedVersion: 1,
      report,
      delegationReason: "Supervisor transcribing the reviewed service record",
      lateEntryReason: "Late entry checked against retained field evidence",
    },
    true,
  );
  f.reports.review(owner, f.id, {
    expectedVersion: 2,
    reportId: sent.reports[0].id,
    decision: "approved",
    notes: "Reviewed the actual visit and source records",
  });
  const first = f.storage.actualAppointments("2026-11-10", "America/New_York")
      .slots[0],
    next = f.storage.actualAppointments("2026-11-11", "America/New_York")
      .slots[0];
  assert.equal(first.scheduled_time, "23:30");
  assert.equal(first.duration, 30);
  assert.equal(first.continues_after, true);
  assert.equal(next.scheduled_time, "00:00");
  assert.equal(next.duration, 90);
  assert.equal(next.continues_before, true);
  assert.equal(first.actual_elapsed_minutes, 120);
  assert.equal(first.actual_worked_minutes, 105);
  const response = await f.dispatch.app.request("/board?date=2026-11-10");
  assert.equal(response.status, 200);
  const board = await response.json();
  assert.equal(board.jobs[0].id, f.id);
  assert.equal(board.jobs[0].schedule_kind, "actual");
  assert.equal(board.jobs[0].duration, 30);
  assert.equal(board.jobs[0].planned_schedule.duration, 60);
  assert.equal(board.jobs[0].planned_schedule.date, "2026-11-16");
  assert.equal(
    (await (await f.dispatch.app.request("/board?date=2026-11-16")).json()).jobs
      .length,
    0,
  );
  assert.equal(
    f.db
      .prepare("SELECT scheduled_date,duration FROM jobs WHERE id=?")
      .get(f.id).scheduled_date,
    "2026-11-16",
  );
  assert.throws(
    () =>
      f.db.prepare("UPDATE jobs SET status='in_progress' WHERE id=?").run(f.id),
    /SERVICE_EXECUTION_CLOSED/,
  );
  assert.throws(
    () =>
      f.db
        .prepare("UPDATE jobs SET scheduled_time='10:00' WHERE id=?")
        .run(f.id),
    /SERVICE_EXECUTION_CLOSED/,
  );
});
test("Actual Dispatcher projection discloses repeated-hour distortion while preserving real elapsed time", (t) => {
  const f = fixture(t);
  const start = "2026-11-01T05:30:00.000Z",
    end = "2026-11-01T07:30:00.000Z",
    report = {
      ...f.report,
      visitStartAt: start,
      visitEndAt: end,
      entries: [{ ...f.report.entries[0], startAt: start, endAt: end }],
    };
  const sent = f.reports.save(
    owner,
    f.id,
    {
      expectedVersion: 1,
      report,
      delegationReason: "Supervisor transcribing the DST service record",
      lateEntryReason: "Late paper record reviewed against actual timestamps",
    },
    true,
  );
  f.reports.review(owner, f.id, {
    expectedVersion: 2,
    reportId: sent.reports[0].id,
    decision: "approved",
    notes: "Reviewed DST offsets and real elapsed labor",
  });
  const slot = f.storage.actualAppointments("2026-11-01", "America/New_York")
    .slots[0];
  assert.equal(slot.scheduled_time, "01:30");
  assert.equal(slot.duration, 60);
  assert.equal(slot.actual_elapsed_minutes, 120);
  assert.equal(slot.actual_segment_minutes, 120);
  assert.equal(slot.actual_timeline_approximate, true);
  assert.equal(
    f.storage.actualAppointments("2026-11-02", "America/New_York").slots.length,
    0,
  );
});

test("Step 2 requires customer equipment for drafts, submissions and immutable equipment evidence", (t) => {
  const f = fixture(t);
  f.module.execution.reassess(owner, f.id, {
    expectedVersion: 1,
    reason: "Fixture equipment removed before reassessment",
  });
  f.db.prepare("UPDATE jobs SET asset_id=NULL WHERE id=?").run(f.id);
  const safety = f.module.execution.detail(owner, f.id);
  f.module.execution.safety(
    member,
    f.id,
    { expectedVersion: safety.workflow.version, answers: { ack: true } },
    true,
  );
  const input = {
    expectedVersion: safety.workflow.version + 1,
    report: f.report,
  };
  for (const submit of [false, true])
    assert.throws(
      () => f.reports.save(member, f.id, input, submit),
      /Equipment is required/,
    );
  assert.equal(
    f.db
      .prepare("SELECT COUNT(*) AS n FROM _service_reports WHERE job_id=?")
      .get(f.id).n,
    0,
  );
  assert.throws(
    () =>
      f.db
        .prepare(
          "INSERT INTO _service_report_drafts(job_id,report_json,actor_id,technician_id) VALUES(?,?,?,?)",
        )
        .run(f.id, JSON.stringify(f.report), member.id, f.tech),
    /SERVICE_EQUIPMENT_REQUIRED/,
  );
  const state = f.module.execution.detail(owner, f.id);
  f.module.execution.reassess(owner, f.id, {
    expectedVersion: state.workflow.version,
    reason: "Fixture equipment restored before renewed safety",
  });
  f.db.prepare("UPDATE jobs SET asset_id=? WHERE id=?").run(f.asset, f.id);
  const next = f.module.execution.detail(owner, f.id);
  f.module.execution.safety(
    member,
    f.id,
    { expectedVersion: next.workflow.version, answers: { ack: true } },
    true,
  );
  const submitted = f.reports.save(
    member,
    f.id,
    { expectedVersion: next.workflow.version + 1, report: f.report },
    true,
  );
  assert.equal(submitted.reports[0].asset_id, f.asset);
  assert.equal(submitted.reports[0].equipment.serial_number, "TEST-SERIAL");
  f.db
    .prepare(
      "UPDATE assets SET name='Renamed controller',serial_number='NEW-SERIAL' WHERE id=?",
    )
    .run(f.asset);
  const persisted = f.reports.detail(member, f.id);
  assert.equal(persisted.job.equipment.name, "Renamed controller");
  assert.equal(persisted.reports[0].equipment.name, "Test controller");
  assert.equal(persisted.reports[0].equipment.serial_number, "TEST-SERIAL");
  assert.throws(
    () =>
      f.db
        .prepare("UPDATE _service_reports SET equipment_json='{}' WHERE id=?")
        .run(submitted.reports[0].id),
    /SERVICE_EVIDENCE_IMMUTABLE/,
  );
});
