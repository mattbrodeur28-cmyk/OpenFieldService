import { createDayBounds } from "../platform/day-bounds.mjs";
import { zonedDay } from "../dispatch/time.mjs";
import { createActualSlots } from "./actual-slots.mjs";
import { randomUUID } from "node:crypto";
import { transaction } from "../platform/sqlite.mjs";
import {
  requestInput,
  reviewInput,
  parse,
  fail,
  validateReport,
} from "./report-domain.mjs";
const admin = (user) =>
  Boolean(
    user?.active &&
      !user.mustChangePassword &&
      ["owner", "admin"].includes(user.role),
  );
export function createPostWork({
  storage,
  identity,
  safety,
  clock = () => new Date(),
}) {
  const db = storage.database;
  const dayBounds = createDayBounds();
  storage.actualAppointments = createActualSlots(db);
  const state = (id) => {
    const row = db
      .prepare("SELECT * FROM _service_execution WHERE job_id=?")
      .get(id);
    if (!row) fail("Enroll this job in the execution workflow first.", 409);
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
  function detail(user, id) {
    return transaction(db, () => {
      const core = safety.readDetail(user, id),
        draft = db
          .prepare("SELECT * FROM _service_report_drafts WHERE job_id=?")
          .get(id),
        reports = db
          .prepare(
            "SELECT r.*,v.decision,v.notes AS review_notes,v.actor_id AS reviewer_id,v.created_at AS reviewed_at FROM _service_reports r LEFT JOIN _service_report_reviews v ON v.report_id=r.id WHERE r.job_id=? ORDER BY r.revision DESC LIMIT 50",
          )
          .all(id);
      return {
        ...core,
        reportDraft: draft
          ? { ...draft, report: JSON.parse(draft.report_json) }
          : null,
        reports: reports.map((r) => ({
          ...r,
          report: JSON.parse(r.report_json),
          equipment: r.equipment_json ? JSON.parse(r.equipment_json) : null,
        })),
        timeEntries: db
          .prepare(
            "SELECT * FROM _service_time_entries WHERE job_id=? ORDER BY start_at,id LIMIT 1000",
          )
          .all(id),
      };
    });
  }
  function save(user, id, input, submit = false) {
    const data = parse(requestInput, input);
    transaction(db, () => {
      const before = state(id),
        actor = identity.executionActor(user, id, data.delegationReason),
        job = db.prepare("SELECT status FROM jobs WHERE id=?").get(id);
      if (before.version !== data.expectedVersion)
        fail(
          "The job workflow changed. Reload and review the current report.",
          409,
        );
      if (
        before.stage !== "post_work" ||
        !before.safety_id ||
        job.status !== "in_progress"
      )
        fail(
          "Submit PJSA and start work before completing the post-work report.",
          409,
        );
      const equipment = db
        .prepare(
          "SELECT a.id,a.name,a.serial_number,a.model,a.manufacturer,a.site_id,s.name AS site_name,s.address AS site_address FROM jobs j JOIN assets a ON a.id=j.asset_id AND a.customer_id=j.customer_id JOIN sites s ON s.id=a.site_id WHERE j.id=?",
        )
        .get(id);
      if (!equipment)
        fail(
          "Equipment is required for Step 2. Link equipment belonging to this customer before saving or submitting the post-work report. If PJSA is already submitted, request safety reassessment first.",
          409,
        );
      if (submit) {
        validateReport(data.report, actor.technicianId, clock());
        for (const entry of data.report.entries) {
          const zone = storage.companyTimeZone?.() || data.report.timeZone;
          const day = zonedDay(zone, new Date(entry.startAt));
          const date = new Date(day + "T00:00:00Z");
          const daysToMonday = (8 - date.getUTCDay()) % 7 || 7;
          const nextMonday = new Date(date.getTime() + daysToMonday * 86400000)
            .toISOString()
            .slice(0, 10);
          if (Date.parse(entry.endAt) > dayBounds(nextMonday, zone)[0])
            fail(
              "Split labor entries at the Monday timesheet boundary and assign actual break minutes to each entry before submitting. The visit itself can cross the boundary.",
              409,
            );
        }
        const safetyTime = db
          .prepare(
            "SELECT submitted_at FROM _service_safety_submissions WHERE id=?",
          )
          .get(before.safety_id).submitted_at;
        const safetyMinute =
          Math.floor(Date.parse(safetyTime.replace(" ", "T") + "Z") / 60000) *
          60000;
        if (
          Date.parse(data.report.visitStartAt) < safetyMinute &&
          (!admin(user) || data.lateEntryReason.length < 10)
        )
          fail(
            "Actual work predates the recorded PJSA. An Owner/Admin must record a late-entry review reason of at least 10 characters; the PJSA timestamp will remain unchanged.",
            409,
          );
        const reportId = randomUUID(),
          revision = db
            .prepare(
              "SELECT COALESCE(MAX(revision),0)+1 AS n FROM _service_reports WHERE job_id=?",
            )
            .get(id).n;
        db.prepare(
          "INSERT INTO _service_reports(id,job_id,revision,report_json,visit_start_at,visit_end_at,actor_id,technician_id,delegation_reason,late_entry_reason,asset_id,equipment_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        ).run(
          reportId,
          id,
          revision,
          JSON.stringify(data.report),
          data.report.visitStartAt,
          data.report.visitEndAt,
          actor.userId,
          actor.technicianId,
          actor.reason,
          data.lateEntryReason,
          equipment.id,
          JSON.stringify(equipment),
        );
        for (const entry of data.report.entries)
          db.prepare(
            "INSERT INTO _service_time_entries(id,report_id,job_id,technician_id,start_at,end_at,break_minutes,worked_minutes,requested_billable_minutes,work_type,notes,actor_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
          ).run(
            randomUUID(),
            reportId,
            id,
            entry.technicianId,
            entry.startAt,
            entry.endAt,
            entry.breakMinutes,
            (Date.parse(entry.endAt) - Date.parse(entry.startAt)) / 60000 -
              entry.breakMinutes,
            entry.requestedBillableMinutes,
            entry.workType,
            entry.notes,
            actor.userId,
          );
        db.prepare(
          "UPDATE _service_execution SET stage='review',current_report_id=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE job_id=?",
        ).run(reportId, id);
        db.prepare("DELETE FROM _service_report_drafts WHERE job_id=?").run(id);
        audit(
          user,
          id,
          "report_submitted",
          before,
          { reportId, revision, technicianId: actor.technicianId },
          actor.reason,
        );
      } else {
        db.prepare(
          "INSERT INTO _service_report_drafts(job_id,report_json,actor_id,technician_id,delegation_reason,late_entry_reason) VALUES(?,?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET report_json=excluded.report_json,actor_id=excluded.actor_id,technician_id=excluded.technician_id,delegation_reason=excluded.delegation_reason,late_entry_reason=excluded.late_entry_reason,updated_at=CURRENT_TIMESTAMP",
        ).run(
          id,
          JSON.stringify(data.report),
          actor.userId,
          actor.technicianId,
          actor.reason,
          data.lateEntryReason,
        );
        db.prepare(
          "UPDATE _service_execution SET version=version+1,updated_at=CURRENT_TIMESTAMP WHERE job_id=?",
        ).run(id);
        audit(
          user,
          id,
          "report_draft_saved",
          before,
          { technicianId: actor.technicianId },
          actor.reason,
        );
      }
    });
    return detail(user, id);
  }
  function review(user, id, input) {
    if (!admin(user)) fail("Owner or administrator review required.", 403);
    const data = parse(reviewInput, input);
    transaction(db, () => {
      const before = state(id),
        job = db.prepare("SELECT status FROM jobs WHERE id=?").get(id);
      if (
        before.version !== data.expectedVersion ||
        before.stage !== "review" ||
        before.current_report_id !== data.reportId ||
        before.service_completed
      )
        fail(
          "This report or review state changed. Reload and review again.",
          409,
        );
      if (
        data.decision === "approved" &&
        !db
          .prepare(
            "SELECT 1 FROM jobs j JOIN assets a ON a.id=j.asset_id AND a.customer_id=j.customer_id WHERE j.id=?",
          )
          .get(id)
      )
        fail(
          "Equipment is required before approving this report. Use a reviewed correction to link equipment and submit a new PJSA/report.",
          409,
        );
      if (job.status !== "in_progress")
        fail(
          "The job is no longer in progress. Review its status before approving the report.",
          409,
        );
      db.prepare(
        "INSERT INTO _service_report_reviews(id,report_id,decision,notes,actor_id) VALUES(?,?,?,?,?)",
      ).run(randomUUID(), data.reportId, data.decision, data.notes, user.id);
      db.prepare(
        "UPDATE _service_time_entries SET state=? WHERE report_id=?",
      ).run(data.decision, data.reportId);
      if (data.decision === "approved") {
        db.prepare(
          "UPDATE _service_execution SET service_completed=1,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE job_id=?",
        ).run(id);
        db.prepare(
          "UPDATE jobs SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(id);
      } else
        db.prepare(
          "UPDATE _service_execution SET stage='post_work',current_report_id=NULL,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE job_id=?",
        ).run(id);
      audit(
        user,
        id,
        data.decision === "approved" ? "service_completed" : "report_rejected",
        before,
        { reportId: data.reportId, decision: data.decision },
        data.notes,
      );
    });
    return detail(user, id);
  }
  function reopen(user, jobId, input = {}) {
    if (!admin(user))
      fail("Owner or administrator access is required to reopen a completed job.", 403);
    if (typeof jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(jobId))
      fail("Invalid job ID.", 400);
    const id = jobId;
    const reasonText =
      typeof input?.reason === "string" && input.reason.trim().length > 0
        ? input.reason.trim().slice(0, 1000)
        : "Reopened to edit ticket or fix billing.";
    transaction(db, () => {
      const job = db.prepare("SELECT * FROM jobs WHERE id=?").get(id);
      if (!job) fail("Job not found.", 404);
      const exec = db
        .prepare("SELECT * FROM _service_execution WHERE job_id=?")
        .get(id);
      if (job.status !== "completed" && !exec?.service_completed && exec?.stage !== "complete")
        fail("Only completed jobs can be reopened.", 409);
      const nextStatus = exec && !exec.safety_id ? "confirmed" : "in_progress";
      const ds = db
        .prepare("SELECT managed FROM _dispatch_job_state WHERE job_id=?")
        .get(id);
      if (exec) {
        const nextStage = exec.safety_id ? "post_work" : "safety";
        db.prepare(
          "UPDATE _service_execution SET service_completed=0,stage=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE job_id=?",
        ).run(nextStage, id);
      }
      if (ds?.managed === 1) {
        db.prepare(
          "UPDATE _dispatch_job_state SET managed=0 WHERE job_id=?",
        ).run(id);
      }
      db.prepare(
        "UPDATE jobs SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(nextStatus, id);
      if (ds?.managed === 1) {
        db.prepare(
          "UPDATE _dispatch_job_state SET managed=1 WHERE job_id=?",
        ).run(id);
      }
      audit(
        user,
        id,
        "job_reopened",
        { status: job.status, stage: exec?.stage || null, serviceCompleted: exec?.service_completed || 0 },
        { status: nextStatus, stage: exec ? (exec.safety_id ? "post_work" : "safety") : null, serviceCompleted: 0 },
        reasonText,
      );
    });
    return detail(user, id);
  }
  return { detail, save, review, reopen };
}
