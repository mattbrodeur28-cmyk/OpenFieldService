import { randomUUID } from "node:crypto";
import { z } from "zod";
import { migrate, transaction } from "../platform/sqlite.mjs";
import { equipmentSchema } from "./equipment-schema.mjs";
import { reportSchema } from "./report-schema.mjs";
import { executionSchema } from "./execution-schema.mjs";
import { ServiceIdentityError } from "./identity.mjs";
const fail = (message, status = 400) => {
  throw new ServiceIdentityError(message, status);
};
const admin = (user) =>
  Boolean(
    user?.active &&
      !user.mustChangePassword &&
      ["owner", "admin"].includes(user.role),
  );
const version = z.number().int().nonnegative().safe();
const question = z
  .object({
    key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/),
    label: z.string().trim().min(1).max(300),
    kind: z.enum(["text", "ack"]),
    required: z.boolean(),
  })
  .strict();
const templateInput = z
  .object({
    templateId: z.string().uuid().optional(),
    expectedRevision: version,
    name: z.string().trim().min(1).max(120),
    questions: z.array(question).min(1).max(30),
    approvedForUse: z.literal(true),
  })
  .strict()
  .refine(
    (v) => new Set(v.questions.map((q) => q.key)).size === v.questions.length,
    "Question keys must be unique.",
  )
  .refine(
    (v) => v.questions.some((q) => q.required),
    "At least one question must be required.",
  );
const enrollInput = z
  .object({
    templateId: z.string().uuid(),
    templateRevision: version,
    expectedScheduleVersion: version,
  })
  .strict();
const answersInput = z
  .object({
    expectedVersion: version,
    answers: z.record(z.union([z.string().max(4000), z.boolean()])),
    delegationReason: z.string().trim().max(1000).default(""),
  })
  .strict()
  .refine(
    (v) =>
      Object.keys(v.answers).length <= 30 &&
      JSON.stringify(v.answers).length <= 32000,
    "Safety answers are too long.",
  );
const resetInput = z
  .object({
    expectedVersion: version,
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();
function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success)
    fail(result.error.issues.map((i) => i.message).join("; "));
  return result.data;
}
export function createSafetyWorkflow({ storage, identity, people = () => [] }) {
  const db = storage.database;
  migrate(db, "_service_execution_migrations", [
    { version: 1, sql: executionSchema },
    { version: 2, sql: reportSchema },
    { version: 3, sql: equipmentSchema },
    {
      version: 4,
      sql: `DROP TRIGGER IF EXISTS _service_execution_assignment;
CREATE TRIGGER _service_execution_assignment BEFORE UPDATE OF technician_id,customer_id,asset_id,scheduled_date,address ON jobs
WHEN EXISTS(SELECT 1 FROM _service_execution WHERE job_id=NEW.id AND safety_id IS NOT NULL)
AND (
  NEW.technician_id IS NOT OLD.technician_id
  OR NEW.customer_id<>OLD.customer_id
  OR (NEW.asset_id IS NOT OLD.asset_id AND NOT (OLD.asset_id IS NULL AND NEW.asset_id IS NOT NULL))
  OR NEW.scheduled_date<>OLD.scheduled_date
  OR NEW.address<>OLD.address
)
BEGIN SELECT RAISE(ABORT,'SERVICE_SAFETY_REASSESS'); END;`,
    },
  ]);
  const job = (id) => {
    const row = db
      .prepare(
        "SELECT j.*,t.name AS technician_name,t.active AS technician_active FROM jobs j LEFT JOIN technicians t ON t.id=j.technician_id WHERE j.id=?",
      )
      .get(id);
    if (!row) fail("Job not found.", 404);
    return row;
  };
  const workflow = (id) => {
    const row = db
      .prepare("SELECT * FROM _service_execution WHERE job_id=?")
      .get(id);
    if (!row)
      fail("This job has not been enrolled in the execution workflow.", 409);
    return row;
  };
  const audit = (user, id, action, before, after, reason = "") =>
    db
      .prepare(
        "INSERT INTO _service_execution_audit(job_id,actor_id,action,before_json,after_json,reason) VALUES(?,?,?,?,?,?)",
      )
      .run(
        id,
        user.id,
        action,
        JSON.stringify(before),
        JSON.stringify(after),
        reason,
      );
  const template = (id, revision) => {
    const row = db
      .prepare(
        "SELECT * FROM _service_safety_templates WHERE template_id=? AND revision=?",
      )
      .get(id, revision);
    if (!row) fail("Safety template revision not found.", 404);
    return { ...row, questions: JSON.parse(row.questions_json) };
  };
  function templates() {
    return db
      .prepare(
        "SELECT t.* FROM _service_safety_templates t WHERE revision=(SELECT MAX(revision) FROM _service_safety_templates WHERE template_id=t.template_id) ORDER BY name,template_id LIMIT 101",
      )
      .all()
      .map((row) => ({ ...row, questions: JSON.parse(row.questions_json) }));
  }
  function saveTemplate(user, input) {
    if (!admin(user)) fail("Owner or administrator access required.", 403);
    const data = parse(templateInput, input);
    return transaction(db, () => {
      const id = data.templateId || randomUUID(),
        latest = db
          .prepare(
            "SELECT COALESCE(MAX(revision),0) AS n FROM _service_safety_templates WHERE template_id=?",
          )
          .get(id).n;
      if (latest !== data.expectedRevision)
        fail(
          "The template changed. Reload and review the latest revision.",
          409,
        );
      if (!latest && templates().length >= 100)
        fail("At most 100 safety templates are supported.", 422);
      db.prepare(
        "INSERT INTO _service_safety_templates(template_id,revision,name,questions_json,approved_by) VALUES(?,?,?,?,?)",
      ).run(id, latest + 1, data.name, JSON.stringify(data.questions), user.id);
      const after = template(id, latest + 1);
      audit(
        user,
        null,
        "template_approved",
        latest ? template(id, latest) : null,
        after,
      );
      return after;
    });
  }
  function readAccess(user, row) {
    if (admin(user)) return;
    const mapped = identity.technician(user);
    if (!mapped || mapped.technician_id !== row.technician_id)
      fail(
        "Only the assigned mapped technician or an administrator may read job execution evidence.",
        403,
      );
  }
  function readDetail(user, id) {
    const row = job(id);
    readAccess(user, row);
    const state =
      db.prepare("SELECT * FROM _service_execution WHERE job_id=?").get(id) ||
      null;
    const draft = db
      .prepare("SELECT * FROM _service_safety_drafts WHERE job_id=?")
      .get(id);
    const safety = state?.safety_id
      ? db
          .prepare("SELECT * FROM _service_safety_submissions WHERE id=?")
          .get(state.safety_id)
      : null;
    const history = db
      .prepare(
        "SELECT id,actor_id,action,reason,created_at FROM _service_execution_audit WHERE job_id=? ORDER BY id DESC LIMIT 100",
      )
      .all(id);
    const actorIds = new Set([
      ...history.map((event) => event.actor_id),
      safety?.actor_id,
      draft?.actor_id,
    ]);
    return {
      companyTimeZone: storage.companyTimeZone?.() || "UTC",
      people: Object.fromEntries(
        people()
          .filter((person) => actorIds.has(person.id))
          .map((person) => [person.id, person.name]),
      ),
      job: {
        id: row.id,
        identifier: row.identifier,
        status: row.status,
        technicianId: row.technician_id,
        technicianName: row.technician_name,
        equipmentId: row.asset_id || null,
        equipment:
          db
            .prepare(
              "SELECT a.id,a.name,a.serial_number,a.model,a.manufacturer,a.site_id,s.name AS site_name FROM assets a JOIN sites s ON s.id=a.site_id WHERE a.id=? AND a.customer_id=?",
            )
            .get(row.asset_id || null, row.customer_id) || null,
        scheduleVersion: storage.schedulingState?.(id)?.version ?? null,
      },
      workflow: state,
      template: state
        ? template(state.template_id, state.template_revision)
        : null,
      templates: admin(user) ? templates() : [],
      draft: draft
        ? { ...draft, answers: JSON.parse(draft.answers_json) }
        : null,
      safety: safety
        ? {
            ...safety,
            answers: JSON.parse(safety.answers_json),
            template: JSON.parse(safety.template_json),
          }
        : null,
      canManage: admin(user),
      history,
    };
  }
  function detail(user, id) {
    return transaction(db, () => readDetail(user, id));
  }
  function enroll(user, id, input) {
    if (!admin(user)) fail("Owner or administrator access required.", 403);
    const data = parse(enrollInput, input);
    transaction(db, () => {
      const row = job(id);
      if (
        !["scheduled", "confirmed"].includes(row.status) ||
        !row.technician_id ||
        !row.technician_active
      )
        fail(
          "Enroll scheduled or confirmed work assigned to an active technician.",
          409,
        );
      if (
        storage.schedulingState?.(id)?.version !== data.expectedScheduleVersion
      )
        fail(
          "The job schedule changed. Reload and review before enrolling.",
          409,
        );
      if (db.prepare("SELECT 1 FROM _service_execution WHERE job_id=?").get(id))
        fail("This job already has an execution workflow.", 409);
      if (db.prepare("SELECT 1 FROM invoices WHERE job_id=?").get(id))
        fail(
          "This job already has billing records. Existing billed work cannot be enrolled retroactively.",
          409,
        );
      template(data.templateId, data.templateRevision);
      db.prepare(
        "INSERT INTO _service_execution(job_id,template_id,template_revision,estimate_json,enrolled_by) VALUES(?,?,?,?,?)",
      ).run(
        id,
        data.templateId,
        data.templateRevision,
        JSON.stringify({
          date: row.scheduled_date,
          time: row.scheduled_time,
          duration: row.duration,
          timeZone: storage.companyTimeZone?.() || "UTC",
          technicianId: row.technician_id,
        }),
        user.id,
      );
      audit(user, id, "enrolled", null, workflow(id));
    });
    return detail(user, id);
  }
  function safety(user, id, input, submit = false) {
    const data = parse(answersInput, input);
    transaction(db, () => {
      const state = workflow(id),
        row = job(id),
        actor = identity.executionActor(user, id, data.delegationReason);
      if (
        !["scheduled", "confirmed", "in_progress"].includes(row.status) ||
        state.stage !== "safety"
      )
        fail(
          "Safety can only be changed at the active safety step. Request reassessment to submit another PJSA.",
          409,
        );
      if (state.version !== data.expectedVersion)
        fail("The job workflow changed. Reload and review before saving.", 409);
      const spec = template(state.template_id, state.template_revision);
      for (const [key, value] of Object.entries(data.answers)) {
        const q = spec.questions.find((q) => q.key === key);
        if (!q || typeof value !== (q.kind === "ack" ? "boolean" : "string"))
          fail("Answers must match this template revision.");
      }
      if (submit)
        for (const q of spec.questions)
          if (
            q.required &&
            (q.kind === "ack"
              ? data.answers[q.key] !== true
              : !String(data.answers[q.key] || "").trim())
          )
            fail("Complete required safety item: " + q.label);
      const before = state;
      let safetyId = null;
      if (submit) {
        safetyId = randomUUID();
        db.prepare(
          "INSERT INTO _service_safety_submissions(id,job_id,template_id,template_revision,template_json,answers_json,actor_id,technician_id,delegation_reason) VALUES(?,?,?,?,?,?,?,?,?)",
        ).run(
          safetyId,
          id,
          spec.template_id,
          spec.revision,
          JSON.stringify(spec),
          JSON.stringify(data.answers),
          actor.userId,
          actor.technicianId,
          actor.reason,
        );
        db.prepare(
          "UPDATE _service_execution SET safety_id=?,stage='post_work',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE job_id=?",
        ).run(safetyId, id);
        db.prepare(
          "UPDATE jobs SET status='in_progress',updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(id);
        db.prepare("DELETE FROM _service_safety_drafts WHERE job_id=?").run(id);
      } else {
        db.prepare(
          "INSERT INTO _service_safety_drafts(job_id,answers_json,actor_id,technician_id,delegation_reason) VALUES(?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET answers_json=excluded.answers_json,actor_id=excluded.actor_id,technician_id=excluded.technician_id,delegation_reason=excluded.delegation_reason,updated_at=CURRENT_TIMESTAMP",
        ).run(
          id,
          JSON.stringify(data.answers),
          actor.userId,
          actor.technicianId,
          actor.reason,
        );
        db.prepare(
          "UPDATE _service_execution SET version=version+1,updated_at=CURRENT_TIMESTAMP WHERE job_id=?",
        ).run(id);
      }
      audit(
        user,
        id,
        submit ? "safety_submitted" : "safety_draft_saved",
        before,
        { ...workflow(id), safetyId, technicianId: actor.technicianId },
        actor.reason,
      );
    });
    return detail(user, id);
  }
  function reassess(user, id, input) {
    if (!admin(user)) fail("Owner or administrator access required.", 403);
    const data = parse(resetInput, input);
    transaction(db, () => {
      const before = workflow(id),
        row = job(id);
      if (before.version !== data.expectedVersion)
        fail("The workflow changed. Reload before reassessment.", 409);
      if (
        !["scheduled", "confirmed", "in_progress"].includes(row.status) ||
        !["safety", "post_work"].includes(before.stage)
      )
        fail(
          "A submitted report or closed job requires a reviewed correction workflow.",
          409,
        );
      db.prepare(
        "UPDATE _service_execution SET stage='safety',safety_id=NULL,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE job_id=?",
      ).run(id);
      db.prepare("DELETE FROM _service_safety_drafts WHERE job_id=?").run(id);
      db.prepare("DELETE FROM _service_report_drafts WHERE job_id=?").run(id);
      if (row.status === "in_progress")
        db.prepare(
          "UPDATE jobs SET status='scheduled',updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(id);
      audit(user, id, "safety_reassessment", before, workflow(id), data.reason);
    });
    return detail(user, id);
  }
  return {
    templates,
    saveTemplate,
    detail,
    readDetail,
    enroll,
    safety,
    reassess,
  };
}
