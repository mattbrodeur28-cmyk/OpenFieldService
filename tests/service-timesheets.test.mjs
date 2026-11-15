import { createDispatcher } from "../src/server/dispatch/service.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStorage } from "../src/server/sqlite.mjs";
import { createCompanySettings } from "../src/server/service/company.mjs";
import { createService } from "../src/server/service/http.mjs";
import { createPostWork } from "../src/server/service/reports.mjs";
import { createDayBounds } from "../src/server/platform/day-bounds.mjs";
const owner = { id: randomUUID(), role: "owner", active: true },
  member = { id: randomUUID(), role: "member", active: true },
  other = { id: randomUUID(), role: "member", active: true },
  hr = { id: randomUUID(), role: "member", hr: true, active: true };
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "ofs-sheets-")),
    path = join(dir, "test.sqlite"),
    storage = openStorage(path),
    db = storage.database;
  createCompanySettings({
    storage,
    env: { COMPANY_TIMEZONE: "America/New_York" },
  });
  const dispatcher = createDispatcher({ storage, currentUser: () => owner });
  const module = createService({
    storage,
    currentUser: () => owner,
    people: () =>
      [owner, member, other, hr].map((u) => ({ id: u.id, name: u.role })),
  });
  const customer = randomUUID(),
    tech = randomUUID(),
    site = randomUUID(),
    asset = randomUUID();
  db.prepare("INSERT INTO customers(id,name) VALUES(?,'Customer')").run(
    customer,
  );
  db.prepare("INSERT INTO technicians(id,name) VALUES(?,'Technician')").run(
    tech,
  );
  db.prepare(
    "INSERT INTO sites(id,customer_id,name) VALUES(?,?,'Building')",
  ).run(site, customer);
  db.prepare(
    "INSERT INTO assets(id,customer_id,site_id,name,serial_number) VALUES(?,?,?,'Controller','TEST')",
  ).run(asset, customer, site);
  module.service.save(owner, tech, { userId: member.id, expectedVersion: 0 });
  const template = module.execution.saveTemplate(owner, {
    expectedRevision: 0,
    name: "Fixture PJSA",
    questions: [{ key: "ack", label: "Reviewed", kind: "ack", required: true }],
    approvedForUse: true,
  });
  const reports = createPostWork({
    storage,
    identity: module.service,
    safety: module.execution,
    clock: () => new Date("2026-12-01T00:00:00Z"),
  });
  function visit(
    start = "2026-11-10T14:00:00.000Z",
    end = "2026-11-10T15:00:00.000Z",
    approve = true,
  ) {
    const id = randomUUID();
    db.prepare(
      "INSERT INTO jobs(id,identifier,customer_id,technician_id,asset_id,scheduled_date,scheduled_time,duration) VALUES(?,?,?,?,?,'2026-11-10','09:00',60)",
    ).run(id, "TIME-" + id, customer, tech, asset);
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
    const report = {
      timeZone: "America/New_York",
      workPerformed: "Fixture equipment inspection",
      findings: "",
      deficiencies: "",
      followUp: "",
      visitStartAt: start,
      visitEndAt: end,
      entries: [
        {
          technicianId: tech,
          startAt: start,
          endAt: end,
          breakMinutes: 10,
          requestedBillableMinutes: 40,
          workType: "work",
          notes: "Recorded work",
        },
      ],
    };
    const submitted = reports.save(
      owner,
      id,
      {
        expectedVersion: 1,
        delegationReason: "Supervisor entering disposable technician evidence",
        lateEntryReason:
          "Fixture historical evidence retained without backdating safety",
        report,
      },
      true,
    );
    if (approve)
      reports.review(owner, id, {
        expectedVersion: 2,
        reportId: submitted.reports[0].id,
        decision: "approved",
        notes: "Reviewed fixture work and labor evidence",
      });
    return { id, report, reportId: submitted.reports[0].id };
  }
  t.after(() => {
    dispatcher.close();
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const key = { technicianId: tech, weekStart: "2026-11-09" };
  return { storage, db, module, tech, key, visit, path, reports };
}
const submit = (f, user = member) => {
  const d = f.module.timesheets.detail(user, f.key);
  return f.module.timesheets.submit(user, {
    ...f.key,
    expectedVersion: d.sheet?.version || 0,
    sourceToken: d.sourceToken,
  });
};
const review = (f, decision = "approved") => {
  const d = f.module.timesheets.detail(owner, f.key);
  return f.module.timesheets.review(owner, {
    ...f.key,
    expectedVersion: d.sheet.version,
    submissionId: d.sheet.submission_id,
    decision,
    notes: "Supervisor reviewed source hours and breaks",
  });
};
test("Weekly timesheets retain source labor, scope technician access, lock submissions and distinguish billing requests", (t) => {
  const f = fixture(t),
    v = f.visit(),
    before = f.module.timesheets.detail(member, f.key);
  assert.deepEqual(before.totals, {
    workedMinutes: 50,
    breakMinutes: 10,
    requestedBillableMinutes: 40,
  });
  assert.equal(before.entries[0].job_id, v.id);
  assert.equal(before.blockers.length, 0);
  for (const u of [other, hr, { ...owner, role: "viewer" }])
    assert.throws(
      () => f.module.timesheets.detail(u, f.key),
      (e) => e.status === 403,
    );
  const submitted = submit(f);
  assert.equal(submitted.sheet.status, "submitted");
  assert.equal(submitted.submissions[0].entries[0].id, before.entries[0].id);
  assert.throws(() => submit(f), /locked/);
  assert.throws(
    () =>
      f.module.timesheets.review(member, {
        ...f.key,
        expectedVersion: 1,
        submissionId: submitted.sheet.submission_id,
        decision: "approved",
        notes: "Member cannot approve this timesheet",
      }),
    (e) => e.status === 403,
  );
  assert.throws(
    () => f.visit("2026-11-11T14:00:00.000Z", "2026-11-11T15:00:00.000Z"),
    /SERVICE_TIMESHEET_LOCKED/,
  );
  const approved = review(f);
  assert.equal(approved.sheet.status, "approved");
  assert.equal(approved.submissions[0].decision, "approved");
  assert.throws(() => review(f), /changed/);
  assert.throws(
    () =>
      f.db
        .prepare(
          "UPDATE _service_timesheet_submissions SET entries_json='[]' WHERE id=?",
        )
        .run(submitted.sheet.submission_id),
    /SERVICE_EVIDENCE_IMMUTABLE/,
  );
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM invoices").get().n, 0);
});
test("Rejected timesheets unlock late report entry and retain prior submission/review revisions", (t) => {
  const f = fixture(t);
  f.visit();
  submit(f);
  review(f, "rejected");
  f.visit("2026-11-11T14:00:00.000Z", "2026-11-11T15:00:00.000Z");
  const revised = submit(f);
  assert.equal(revised.submissions.length, 2);
  assert.equal(revised.submissions[0].revision, 2);
  assert.equal(revised.submissions[0].entries.length, 2);
  assert.equal(revised.submissions[1].decision, "rejected");
  assert.equal(revised.submissions[1].entries.length, 1);
  assert.equal(review(f).totals.workedMinutes, 100);
});
test("Timesheet snapshots reject stale sources, await report review and roll back failed review writes", (t) => {
  const f = fixture(t),
    v = f.visit(undefined, undefined, false),
    d = f.module.timesheets.detail(member, f.key);
  assert.match(d.blockers.join(" "), /report review/);
  assert.throws(() => submit(f), /report review/);
  f.reports.review(owner, v.id, {
    expectedVersion: 2,
    reportId: v.reportId,
    decision: "approved",
    notes: "Approved fixture report after correction",
  });
  assert.throws(
    () =>
      f.module.timesheets.submit(member, {
        ...f.key,
        expectedVersion: 0,
        sourceToken: d.sourceToken,
      }),
    /source entries changed/,
  );
  submit(f);
  f.db
    .prepare("UPDATE jobs SET identifier='Changed identifier' WHERE id=?")
    .run(v.id);
  assert.throws(() => review(f), /source changed/);
  const rejected = review(f, "rejected");
  assert.equal(rejected.sheet.status, "rejected");
  submit(f);
  f.db.exec(
    "CREATE TRIGGER fixture_sheet_review_failure BEFORE INSERT ON _service_timesheet_reviews BEGIN SELECT RAISE(ABORT,'review failure'); END;",
  );
  assert.throws(() => review(f), /review failure/);
  assert.equal(
    f.module.timesheets.detail(owner, f.key).sheet.status,
    "submitted",
  );
});
test("Timesheet periods use exact DST bounds and reports must explicitly split labor at Monday boundaries", (t) => {
  const bounds = createDayBounds();
  assert.equal(
    (bounds("2026-11-01", "America/New_York")[1] -
      bounds("2026-11-01", "America/New_York")[0]) /
      3600000,
    25,
  );
  assert.equal(
    (bounds("2026-03-08", "America/New_York")[1] -
      bounds("2026-03-08", "America/New_York")[0]) /
      3600000,
    23,
  );
  const f = fixture(t);
  assert.throws(
    () =>
      f.module.timesheets.detail(member, { ...f.key, weekStart: "2026-11-10" }),
    /Monday/,
  );
  assert.throws(
    () => f.visit("2026-11-16T04:30:00.000Z", "2026-11-16T05:30:00.000Z"),
    /Split labor entries/,
  );
});

test("Audited approved-period corrections retain past approval, unlock new source labor and require renewed review", (t) => {
  const f = fixture(t);
  f.visit();
  submit(f);
  const approved = review(f),
    input = {
      ...f.key,
      expectedVersion: approved.sheet.version,
      reason: "Supervisor reopened week to record a missing emergency visit",
      acknowledgeExternalReview: true,
    };
  assert.throws(
    () => f.module.timesheets.reopen(hr, input),
    (e) => e.status === 403,
  );
  assert.throws(() =>
    f.module.timesheets.reopen(owner, {
      ...input,
      acknowledgeExternalReview: false,
    }),
  );
  const reopened = f.module.timesheets.reopen(owner, input);
  assert.equal(reopened.sheet.status, "rejected");
  assert.equal(reopened.adjustments.length, 1);
  assert.equal(reopened.submissions[0].decision, "approved");
  assert.throws(
    () => f.module.timesheets.reopen(owner, input),
    /period changed/,
  );
  assert.throws(
    () => f.module.timesheets.exportCsv(member, f.key),
    /currently approved/,
  );
  f.visit("2026-11-11T14:00:00.000Z", "2026-11-11T15:00:00.000Z");
  const second = submit(f);
  assert.equal(second.submissions.length, 2);
  assert.equal(second.submissions[0].entries.length, 2);
  assert.equal(review(f).totals.workedMinutes, 100);
  assert.throws(
    () =>
      f.db
        .prepare("UPDATE _service_timesheet_adjustments SET reason='changed'")
        .run(),
    /SERVICE_EVIDENCE_IMMUTABLE/,
  );
  f.db.exec(
    "CREATE TRIGGER fixture_adjust_failure BEFORE INSERT ON _service_timesheet_adjustments BEGIN SELECT RAISE(ABORT,'adjust failure'); END;",
  );
  const final = f.module.timesheets.detail(owner, f.key);
  assert.throws(
    () =>
      f.module.timesheets.reopen(owner, {
        ...input,
        expectedVersion: final.sheet.version,
      }),
    /adjust failure/,
  );
  assert.equal(
    f.module.timesheets.detail(owner, f.key).sheet.status,
    "approved",
  );
});
test("Approved CSV exports use retained source evidence, escape formulas and never expose other technicians", (t) => {
  const f = fixture(t),
    v = f.visit();
  f.db.prepare("UPDATE jobs SET identifier='=1+1' WHERE id=?").run(v.id);
  assert.throws(
    () => f.module.timesheets.exportCsv(member, f.key),
    /currently approved/,
  );
  submit(f);
  review(f);
  const exported = f.module.timesheets.exportCsv(member, f.key);
  assert.match(exported.csv, /"'=1\+1"/);
  assert.match(exported.csv, /worked_minutes/);
  assert.match(exported.csv, /,"50","10","40",/);
  f.db
    .prepare("UPDATE jobs SET identifier='Later renamed job' WHERE id=?")
    .run(v.id);
  assert.equal(f.module.timesheets.exportCsv(member, f.key).csv, exported.csv);
  assert.throws(
    () => f.module.timesheets.exportCsv(other, f.key),
    (e) => e.status === 403,
  );
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM invoices").get().n, 0);
});
