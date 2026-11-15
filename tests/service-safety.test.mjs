import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStorage } from "../src/server/sqlite.mjs";
import { createDispatcher } from "../src/server/dispatch/service.mjs";
import { createService } from "../src/server/service/http.mjs";
const owner = { id: randomUUID(), role: "owner", active: true },
  member = { id: randomUUID(), role: "member", active: true },
  other = { id: randomUUID(), role: "member", active: true },
  hr = { id: randomUUID(), role: "member", active: true, hr: true },
  viewer = { id: randomUUID(), role: "viewer", active: true };
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "ofs-pjsa-")),
    filename = join(dir, "service.sqlite"),
    storage = openStorage(filename),
    db = storage.database,
    customer = randomUUID(),
    tech = randomUUID(),
    otherTech = randomUUID(),
    id = randomUUID();
  db.prepare("INSERT INTO customers(id,name) VALUES(?,?)").run(
    customer,
    "Native safety customer",
  );
  for (const key of [tech, otherTech])
    db.prepare("INSERT INTO technicians(id,name) VALUES(?,?)").run(
      key,
      "Technician",
    );
  db.prepare(
    "INSERT INTO jobs(id,identifier,customer_id,technician_id,scheduled_date,scheduled_time,duration) VALUES(?,'PJSA-1',?,?,'2026-11-16','09:00',60)",
  ).run(id, customer, tech);
  let actor = owner;
  const dispatch = createDispatcher({
    storage,
    currentUser: () => actor,
    env: { DISPATCH_TIMEZONE: "America/New_York" },
  });
  const module = createService({
    storage,
    currentUser: () => actor,
    people: () =>
      [owner, member, other, hr].map((u) => ({ id: u.id, name: u.role })),
  });
  module.service.save(owner, tech, { userId: member.id, expectedVersion: 0 });
  t.after(() => {
    dispatch.close();
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const template = module.execution.saveTemplate(owner, {
    expectedRevision: 0,
    name: "Reviewed company PJSA",
    questions: [
      {
        key: "hazards",
        label: "Hazards and controls",
        kind: "text",
        required: true,
      },
      {
        key: "reviewed",
        label: "Reviewed company procedure",
        kind: "ack",
        required: true,
      },
    ],
    approvedForUse: true,
  });
  return {
    db,
    storage,
    filename,
    customer,
    tech,
    otherTech,
    id,
    module,
    template,
    setActor: (u) => {
      actor = u;
    },
    enroll: () =>
      module.execution.enroll(owner, id, {
        templateId: template.template_id,
        templateRevision: 1,
        expectedScheduleVersion: storage.schedulingState(id).version,
      }),
  };
}
const answers = {
  hazards: "Recorded the reviewed site-specific controls.",
  reviewed: true,
};
test("PJSA gates are opt-in, retain original estimates and enforce safety across legacy status and invoice writes", (t) => {
  const f = fixture(t);
  assert.equal(f.module.execution.detail(member, f.id).workflow, null);
  f.db.prepare("UPDATE jobs SET status='in_progress' WHERE id=?").run(f.id);
  assert.throws(() => f.enroll(), /scheduled or confirmed/);
  f.db.prepare("UPDATE jobs SET status='scheduled' WHERE id=?").run(f.id);
  const state = f.enroll();
  assert.equal(state.workflow.stage, "safety");
  assert.equal(JSON.parse(state.workflow.estimate_json).duration, 60);
  assert.throws(
    () =>
      f.db.prepare("UPDATE jobs SET status='in_progress' WHERE id=?").run(f.id),
    /SERVICE_SAFETY_REQUIRED/,
  );
  assert.throws(
    () =>
      f.db.prepare("UPDATE jobs SET status='completed' WHERE id=?").run(f.id),
    /SERVICE_REPORT_REQUIRED/,
  );
  assert.throws(
    () =>
      f.db
        .prepare(
          "INSERT INTO invoices(identifier,customer_id,job_id) VALUES(?,?,?)",
        )
        .run("BLOCKED", f.customer, f.id),
    /SERVICE_BILLING_REVIEW/,
  );
  const submitted = f.module.execution.safety(
    member,
    f.id,
    { expectedVersion: 0, answers },
    true,
  );
  assert.equal(submitted.workflow.stage, "post_work");
  assert.equal(submitted.job.status, "in_progress");
  assert.equal(submitted.safety.actor_id, member.id);
  assert.equal(submitted.safety.technician_id, f.tech);
  assert.deepEqual(submitted.safety.answers, answers);
  assert.throws(
    () =>
      f.db.prepare("UPDATE jobs SET status='completed' WHERE id=?").run(f.id),
    /SERVICE_REPORT_REQUIRED/,
  );
  assert.throws(
    () =>
      f.db
        .prepare(
          "UPDATE _service_safety_submissions SET answers_json=? WHERE job_id=?",
        )
        .run("{}", f.id),
    /IMMUTABLE/,
  );
  assert.throws(
    () =>
      f.db
        .prepare("DELETE FROM _service_safety_submissions WHERE job_id=?")
        .run(f.id),
    /IMMUTABLE/,
  );
  assert.throws(
    () => f.db.prepare("DELETE FROM jobs WHERE id=?").run(f.id),
    /FOREIGN KEY/,
  );
});
test("Required typed answers, actors, draft persistence and stale versions are checked without replacing evidence", (t) => {
  const f = fixture(t);
  f.enroll();
  for (const user of [
    other,
    hr,
    viewer,
    { ...member, active: false },
    { ...member, mustChangePassword: true },
  ])
    assert.throws(
      () =>
        f.module.execution.safety(
          user,
          f.id,
          { expectedVersion: 0, answers },
          true,
        ),
      /required|cannot submit/,
    );
  assert.throws(
    () => f.module.execution.detail(other, f.id),
    /assigned mapped/,
  );
  assert.throws(
    () =>
      f.module.execution.safety(
        member,
        f.id,
        { expectedVersion: 0, answers: { hazards: "", reviewed: true } },
        true,
      ),
    /required safety item/,
  );
  assert.throws(
    () =>
      f.module.execution.safety(
        member,
        f.id,
        {
          expectedVersion: 0,
          answers: { hazards: "Site-specific hazards", reviewed: false },
        },
        true,
      ),
    /required safety item/,
  );
  assert.throws(
    () =>
      f.module.execution.safety(
        member,
        f.id,
        { expectedVersion: 0, answers: { hazards: "Scope", reviewed: "yes" } },
        true,
      ),
    /match/,
  );
  assert.throws(
    () =>
      f.module.execution.safety(
        member,
        f.id,
        { expectedVersion: 0, answers: { ...answers, unknown: "extra" } },
        true,
      ),
    /match/,
  );
  const draft = f.module.execution.safety(member, f.id, {
    expectedVersion: 0,
    answers: { hazards: "Partial draft" },
  });
  assert.equal(draft.workflow.version, 1);
  assert.equal(draft.draft.answers.hazards, "Partial draft");
  assert.equal(draft.job.status, "scheduled");
  assert.throws(
    () =>
      f.module.execution.safety(
        member,
        f.id,
        { expectedVersion: 0, answers },
        true,
      ),
    /changed/,
  );
  const submitted = f.module.execution.safety(
    owner,
    f.id,
    {
      expectedVersion: 1,
      answers,
      delegationReason: "Supervisor entering reviewed paper PJSA",
    },
    true,
  );
  assert.equal(submitted.safety.actor_id, owner.id);
  assert.equal(
    submitted.safety.delegation_reason,
    "Supervisor entering reviewed paper PJSA",
  );
  assert.equal(submitted.draft, null);
  assert.throws(
    () =>
      f.module.execution.safety(
        member,
        f.id,
        { expectedVersion: 2, answers },
        true,
      ),
    /active safety step/,
  );
});
test("Template revisions and reassessment preserve old PJSA and invalidate changed job context", (t) => {
  const f = fixture(t);
  f.enroll();
  assert.throws(
    () =>
      f.module.execution.saveTemplate(hr, {
        expectedRevision: 0,
        name: "No",
        questions: f.template.questions,
        approvedForUse: true,
      }),
    /administrator/,
  );
  const revised = f.module.execution.saveTemplate(owner, {
    templateId: f.template.template_id,
    expectedRevision: 1,
    name: "New review",
    questions: [
      ...f.template.questions,
      { key: "extra", label: "New requirement", kind: "text", required: true },
    ],
    approvedForUse: true,
  });
  assert.equal(revised.revision, 2);
  assert.equal(f.module.execution.detail(member, f.id).template.revision, 1);
  f.module.execution.safety(
    member,
    f.id,
    { expectedVersion: 0, answers },
    true,
  );
  assert.throws(
    () =>
      f.db
        .prepare("UPDATE jobs SET technician_id=? WHERE id=?")
        .run(f.otherTech, f.id),
    /REASSESS/,
  );
  assert.throws(
    () =>
      f.db
        .prepare("UPDATE jobs SET scheduled_date='2026-11-17' WHERE id=?")
        .run(f.id),
    /REASSESS/,
  );
  const reset = f.module.execution.reassess(owner, f.id, {
    expectedVersion: 1,
    reason: "Site access conditions changed for reassessment",
  });
  assert.equal(reset.workflow.stage, "safety");
  assert.equal(reset.safety, null);
  assert.equal(
    f.db
      .prepare(
        "SELECT COUNT(*) AS n FROM _service_safety_submissions WHERE job_id=?",
      )
      .get(f.id).n,
    1,
  );
  f.module.execution.safety(member, f.id, {
    expectedVersion: 2,
    answers: { hazards: "New draft" },
  });
  f.db
    .prepare("UPDATE jobs SET technician_id=? WHERE id=?")
    .run(f.otherTech, f.id);
  assert.equal(f.module.execution.detail(owner, f.id).draft, null);
  assert.equal(f.module.execution.detail(owner, f.id).workflow.version, 4);
  assert.throws(
    () => f.module.execution.detail(member, f.id),
    /assigned mapped/,
  );
  assert.throws(
    () =>
      f.db
        .prepare(
          "UPDATE _service_safety_templates SET name='Changed' WHERE template_id=?",
        )
        .run(f.template.template_id),
    /IMMUTABLE/,
  );
});
test("Safety submission rolls back evidence, job status and workflow version when audit cannot persist", (t) => {
  const f = fixture(t);
  f.enroll();
  f.db.exec(
    "CREATE TRIGGER fail_pjsa_audit BEFORE INSERT ON _service_execution_audit WHEN NEW.action='safety_submitted' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END",
  );
  assert.throws(
    () =>
      f.module.execution.safety(
        member,
        f.id,
        { expectedVersion: 0, answers },
        true,
      ),
    /audit unavailable/,
  );
  const state = f.module.execution.detail(member, f.id);
  assert.equal(state.workflow.version, 0);
  assert.equal(state.workflow.stage, "safety");
  assert.equal(state.job.status, "scheduled");
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM _service_safety_submissions").get()
      .n,
    0,
  );
});
test("Execution HTTP applies session, anti-CSRF and actor guards to safety and enrollment", async (t) => {
  const f = fixture(t);
  f.enroll();
  f.setActor(viewer);
  assert.equal(
    (await f.module.app.request("/jobs/" + f.id + "/workflow")).status,
    403,
  );
  f.setActor(member);
  const request = (path, body, headers = {}) =>
    f.module.app.request(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "OpenFieldService",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (
      await request(
        "/jobs/" + f.id + "/safety-submit",
        { expectedVersion: 0, answers },
        { "X-Requested-With": "" },
      )
    ).status,
    403,
  );
  const response = await request("/jobs/" + f.id + "/safety-submit", {
    expectedVersion: 0,
    answers,
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).workflow.stage, "post_work");
});
