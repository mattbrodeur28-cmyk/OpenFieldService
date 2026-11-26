import {weeklyTimesheet} from "./weekly-timesheet.mjs";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { migrate, transaction } from "../platform/sqlite.mjs";
import { createDayBounds } from "../platform/day-bounds.mjs";
import { validDate } from "../dispatch/time.mjs";
import { ServiceIdentityError } from "./identity.mjs";
const fail = (message, status = 400) => {
  throw new ServiceIdentityError(message, status);
};
const admin = (u) =>
  u?.active && !u.mustChangePassword && ["owner", "admin"].includes(u.role);
const schema = `
CREATE TABLE _service_timesheets(id TEXT PRIMARY KEY,technician_id TEXT NOT NULL REFERENCES technicians(id) ON DELETE RESTRICT,week_start TEXT NOT NULL,time_zone TEXT NOT NULL,start_at TEXT NOT NULL,end_at TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('submitted','approved','rejected')),version INTEGER NOT NULL,submission_id TEXT REFERENCES _service_timesheet_submissions(id),UNIQUE(technician_id,week_start));
CREATE INDEX _service_sheet_person_period ON _service_timesheets(technician_id,start_at,end_at,status);
CREATE TABLE _service_timesheet_submissions(id TEXT PRIMARY KEY,sheet_id TEXT NOT NULL REFERENCES _service_timesheets(id) ON DELETE RESTRICT,revision INTEGER NOT NULL,entries_json TEXT NOT NULL,source_token TEXT NOT NULL,actor_id TEXT NOT NULL,delegation_reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(sheet_id,revision));
CREATE TABLE _service_timesheet_reviews(id TEXT PRIMARY KEY,submission_id TEXT NOT NULL UNIQUE REFERENCES _service_timesheet_submissions(id) ON DELETE RESTRICT,decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')),notes TEXT NOT NULL,actor_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TRIGGER _service_sheet_submission_no_update BEFORE UPDATE ON _service_timesheet_submissions BEGIN SELECT RAISE(ABORT,'SERVICE_EVIDENCE_IMMUTABLE'); END;
CREATE TRIGGER _service_sheet_submission_no_delete BEFORE DELETE ON _service_timesheet_submissions BEGIN SELECT RAISE(ABORT,'SERVICE_EVIDENCE_IMMUTABLE'); END;
CREATE TRIGGER _service_sheet_review_no_update BEFORE UPDATE ON _service_timesheet_reviews BEGIN SELECT RAISE(ABORT,'SERVICE_EVIDENCE_IMMUTABLE'); END;
CREATE TRIGGER _service_sheet_review_no_delete BEFORE DELETE ON _service_timesheet_reviews BEGIN SELECT RAISE(ABORT,'SERVICE_EVIDENCE_IMMUTABLE'); END;
CREATE TRIGGER _service_sheet_time_insert BEFORE INSERT ON _service_time_entries WHEN NEW.state<>'rejected' AND EXISTS(SELECT 1 FROM _service_timesheets s WHERE s.technician_id=NEW.technician_id AND s.status IN ('submitted','approved') AND s.start_at<NEW.end_at AND s.end_at>NEW.start_at) BEGIN SELECT RAISE(ABORT,'SERVICE_TIMESHEET_LOCKED'); END;
CREATE TRIGGER _service_sheet_time_state BEFORE UPDATE OF state ON _service_time_entries WHEN NEW.state<>OLD.state AND EXISTS(SELECT 1 FROM _service_timesheets s WHERE s.technician_id=NEW.technician_id AND s.status IN ('submitted','approved') AND s.start_at<NEW.end_at AND s.end_at>NEW.start_at) BEGIN SELECT RAISE(ABORT,'SERVICE_TIMESHEET_LOCKED'); END;
`;
const adjustmentSchema = `
CREATE TABLE _service_timesheet_adjustments(id TEXT PRIMARY KEY,sheet_id TEXT NOT NULL REFERENCES _service_timesheets(id) ON DELETE RESTRICT,submission_id TEXT NOT NULL REFERENCES _service_timesheet_submissions(id),actor_id TEXT NOT NULL,reason TEXT NOT NULL,previous_version INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TRIGGER _service_sheet_adjustment_no_update BEFORE UPDATE ON _service_timesheet_adjustments BEGIN SELECT RAISE(ABORT,'SERVICE_EVIDENCE_IMMUTABLE'); END;
CREATE TRIGGER _service_sheet_adjustment_no_delete BEFORE DELETE ON _service_timesheet_adjustments BEGIN SELECT RAISE(ABORT,'SERVICE_EVIDENCE_IMMUTABLE'); END;
`;
const week = z
  .string()
  .refine(
    (v) => validDate(v) && new Date(v + "T00:00:00Z").getUTCDay() === 1,
    "Choose a Monday week start.",
  );
const key = z
  .object({ technicianId: z.string().uuid(), weekStart: week })
  .strict();
const version = z.number().int().nonnegative().safe();
const submitInput = key
  .extend({
    expectedVersion: version,
    sourceToken: z.string().regex(/^[a-f0-9]{64}$/),
    delegationReason: z.string().trim().max(1000).default(""),
  })
  .strict();
const reviewInput = key
  .extend({
    expectedVersion: version,
    submissionId: z.string().uuid(),
    decision: z.enum(["approved", "rejected"]),
    notes: z.string().trim().min(10).max(2000),
  })
  .strict();
const parse = (spec, input) => {
  const r = spec.safeParse(input);
  if (!r.success) fail(r.error.issues.map((i) => i.message).join("; "));
  return r.data;
};
export function createTimesheets({ storage, identity, company }) {
  const db = storage.database,
    bounds = createDayBounds();
  migrate(db, "_service_timesheet_migrations", [
    { version: 1, sql: schema },
    { version: 2, sql: adjustmentSchema },
  ]);
  function access(user, id) {
    if (!user?.active || user.mustChangePassword)
      fail("Sign in to continue.", 401);
    if (!admin(user) && identity.technician(user)?.technician_id !== id)
      fail("You can only view your assigned technician timesheet.", 403);
    if (!db.prepare("SELECT 1 FROM technicians WHERE id=?").get(id))
      fail("Technician not found.", 404);
  }
  function options(user) {
    if (admin(user)) {
      const technicians = db
        .prepare(
          "SELECT id,name,active FROM technicians ORDER BY name,id LIMIT 501",
        )
        .all();
      if (technicians.length > 500)
        fail("Narrow the company scope before opening timesheets.", 422);
      return { technicians, canReview: true, timeZone: company.timeZone() };
    }
    const row = identity.technician(user);
    return {
      technicians: row
        ? [
            {
              id: row.technician_id,
              name: row.technician_name,
              active: row.active,
            },
          ]
        : [],
      canReview: false,
      timeZone: company.timeZone(),
    };
  }
  function read(user, input) {
    const data = parse(key, input);
    access(user, data.technicianId);
    const sheet =
      db
        .prepare(
          "SELECT * FROM _service_timesheets WHERE technician_id=? AND week_start=?",
        )
        .get(data.technicianId, data.weekStart) || null;
    const timeZone = sheet?.time_zone || company.timeZone(),
      next = new Date(Date.parse(data.weekStart + "T00:00:00Z") + 7 * 86400000)
        .toISOString()
        .slice(0, 10),
      startAt =
        sheet?.start_at ||
        new Date(bounds(data.weekStart, timeZone)[0]).toISOString(),
      endAt =
        sheet?.end_at || new Date(bounds(next, timeZone)[0]).toISOString();
    const entries = db
      .prepare(
        "SELECT t.*,j.identifier AS job_identifier FROM _service_time_entries t JOIN jobs j ON j.id=t.job_id WHERE t.technician_id=? AND t.state<>'rejected' AND t.start_at<? AND t.end_at>? ORDER BY t.start_at,t.id LIMIT 1001",
      )
      .all(data.technicianId, endAt, startAt);
    if (entries.length > 1000)
      fail(
        "This week contains too many time entries. Use an administrator-led export.",
        422,
      );
    const token = createHash("sha256")
      .update(JSON.stringify({ startAt, endAt, entries }))
      .digest("hex");
    const submissions = sheet
      ? db
          .prepare(
            "SELECT x.*,r.decision,r.notes AS review_notes,r.actor_id AS reviewer_id,r.created_at AS reviewed_at FROM _service_timesheet_submissions x LEFT JOIN _service_timesheet_reviews r ON r.submission_id=x.id WHERE x.sheet_id=? ORDER BY x.revision DESC LIMIT 50",
          )
          .all(sheet.id)
          .map((s) => ({ ...s, entries: JSON.parse(s.entries_json) }))
      : [];
    const blockers = [];
    if (!entries.length)
      blockers.push("No report labor recorded for this week.");
    if (entries.some((e) => e.state !== "approved"))
      blockers.push("Complete supervisor report review for every entry first.");
    if (entries.some((e) => e.start_at < startAt || e.end_at > endAt))
      blockers.push(
        "A labor entry crosses this week boundary. Reject and split the report entry at the boundary before submitting; break time cannot be allocated automatically.",
      );
    if (
      db
        .prepare(
          "SELECT 1 FROM _service_timesheets WHERE technician_id=? AND week_start<>? AND status IN ('submitted','approved') AND start_at<? AND end_at>?",
        )
        .get(data.technicianId, data.weekStart, endAt, startAt)
    )
      blockers.push(
        "This week overlaps a retained timesheet boundary after a timezone change. A reviewed period migration is required.",
      );
    const totals = entries.reduce(
      (a, e) => ({
        workedMinutes: a.workedMinutes + e.worked_minutes,
        breakMinutes: a.breakMinutes + e.break_minutes,
        requestedBillableMinutes:
          a.requestedBillableMinutes + e.requested_billable_minutes,
      }),
      { workedMinutes: 0, breakMinutes: 0, requestedBillableMinutes: 0 },
    );
    return {
      technicianId: data.technicianId,
      weekStart: data.weekStart,
      weekly:weeklyTimesheet(entries,{weekStart:data.weekStart,timeZone}),
      timeZone,
      startAt,
      endAt,
      sheet,
      entries,
      sourceToken: token,
      submissions,
      adjustments: sheet
        ? db
            .prepare(
              "SELECT * FROM _service_timesheet_adjustments WHERE sheet_id=? ORDER BY previous_version DESC LIMIT 50",
            )
            .all(sheet.id)
        : [],
      blockers,
      totals,
      canReview: admin(user),
    };
  }
  const detail = (user, input) => transaction(db, () => read(user, input));
  function submit(user, input) {
    const data = parse(submitInput, input);
    transaction(db, () => {
      const before = read(user, {
        technicianId: data.technicianId,
        weekStart: data.weekStart,
      });
      if (
        (before.sheet?.version || 0) !== data.expectedVersion ||
        before.sourceToken !== data.sourceToken
      )
        fail(
          "Timesheet or source entries changed. Reload and review before submitting.",
          409,
        );
      if (before.sheet && before.sheet.status !== "rejected")
        fail("This timesheet is submitted or approved and locked.", 409);
      if (before.blockers.length) fail(before.blockers.join(" "), 409);
      if (
        identity.technician(user)?.technician_id !== data.technicianId &&
        (!admin(user) || data.delegationReason.length < 10)
      )
        fail(
          "Submitting for another technician requires an administrator reason of at least 10 characters.",
          403,
        );
      const id = before.sheet?.id || randomUUID(),
        submissionId = randomUUID(),
        revision = before.sheet
          ? db
              .prepare(
                "SELECT MAX(revision)+1 AS n FROM _service_timesheet_submissions WHERE sheet_id=?",
              )
              .get(id).n
          : 1;
      if (!before.sheet)
        db.prepare(
          "INSERT INTO _service_timesheets(id,technician_id,week_start,time_zone,start_at,end_at,status,version) VALUES(?,?,?,?,?,?,'submitted',1)",
        ).run(
          id,
          data.technicianId,
          data.weekStart,
          before.timeZone,
          before.startAt,
          before.endAt,
        );
      db.prepare(
        "INSERT INTO _service_timesheet_submissions(id,sheet_id,revision,entries_json,source_token,actor_id,delegation_reason) VALUES(?,?,?,?,?,?,?)",
      ).run(
        submissionId,
        id,
        revision,
        JSON.stringify(before.entries),
        before.sourceToken,
        user.id,
        data.delegationReason,
      );
      db.prepare(
        "UPDATE _service_timesheets SET submission_id=?,status='submitted',version=? WHERE id=?",
      ).run(submissionId, data.expectedVersion + 1, id);
    });
    return detail(user, {
      technicianId: data.technicianId,
      weekStart: data.weekStart,
    });
  }
  function review(user, input) {
    if (!admin(user)) fail("Owner or administrator review required.", 403);
    const data = parse(reviewInput, input);
    transaction(db, () => {
      const before = read(user, {
        technicianId: data.technicianId,
        weekStart: data.weekStart,
      });
      if (
        before.sheet?.version !== data.expectedVersion ||
        before.sheet.status !== "submitted" ||
        before.sheet.submission_id !== data.submissionId
      )
        fail(
          "The timesheet review state changed. Reload before reviewing.",
          409,
        );
      if (
        data.decision === "approved" &&
        (before.submissions[0].source_token !== before.sourceToken ||
          before.blockers.length)
      )
        fail(
          "Timesheet source changed. Reject it and review the current source entries.",
          409,
        );
      db.prepare(
        "INSERT INTO _service_timesheet_reviews(id,submission_id,decision,notes,actor_id) VALUES(?,?,?,?,?)",
      ).run(
        randomUUID(),
        data.submissionId,
        data.decision,
        data.notes,
        user.id,
      );
      db.prepare(
        "UPDATE _service_timesheets SET status=?,version=version+1 WHERE id=?",
      ).run(data.decision, before.sheet.id);
    });
    return detail(user, {
      technicianId: data.technicianId,
      weekStart: data.weekStart,
    });
  }
  function reopen(user, input) {
    if (!admin(user)) fail("Owner or administrator review required.", 403);
    const data = parse(
      key
        .extend({
          expectedVersion: version,
          reason: z.string().trim().min(10).max(2000),
          acknowledgeExternalReview: z.literal(true),
        })
        .strict(),
      input,
    );
    transaction(db, () => {
      const before = read(user, {
        technicianId: data.technicianId,
        weekStart: data.weekStart,
      });
      if (
        before.sheet?.status !== "approved" ||
        before.sheet.version !== data.expectedVersion
      )
        fail("The approved period changed. Reload before reopening it.", 409);
      db.prepare(
        "INSERT INTO _service_timesheet_adjustments(id,sheet_id,submission_id,actor_id,reason,previous_version) VALUES(?,?,?,?,?,?)",
      ).run(
        randomUUID(),
        before.sheet.id,
        before.sheet.submission_id,
        user.id,
        data.reason,
        before.sheet.version,
      );
      db.prepare(
        "UPDATE _service_timesheets SET status='rejected',version=version+1 WHERE id=?",
      ).run(before.sheet.id);
    });
    return detail(user, {
      technicianId: data.technicianId,
      weekStart: data.weekStart,
    });
  }
  function exportCsv(user, input) {
    return transaction(db, () => {
      const data = read(user, input);
      if (data.sheet?.status !== "approved")
        fail("Only currently approved timesheets can be exported.", 409);
      const snapshot = data.submissions.find(
        (s) => s.id === data.sheet.submission_id,
      );
      const cell = (v) => {
        let value = String(v ?? "");
        if (/^[\s]*[=+@-]/u.test(value)) value = "'" + value;
        return '"' + value.replaceAll('"', '""') + '"';
      };
      const headers = [
        "timesheet_id",
        "submission_id",
        "revision",
        "technician_id",
        "week_start",
        "time_zone",
        "entry_id",
        "job_id",
        "job_identifier",
        "start_at_utc",
        "end_at_utc",
        "worked_minutes",
        "break_minutes",
        "requested_billable_minutes",
        "work_type",
      ];
      const rows = snapshot.entries.map((e) => [
        data.sheet.id,
        snapshot.id,
        snapshot.revision,
        data.technicianId,
        data.weekStart,
        data.timeZone,
        e.id,
        e.job_id,
        e.job_identifier,
        e.start_at,
        e.end_at,
        e.worked_minutes,
        e.break_minutes,
        e.requested_billable_minutes,
        e.work_type,
      ]);
      return {
        filename: `timesheet-${data.technicianId}-${data.weekStart}.csv`,
        csv:
          [headers, ...rows]
            .map((row) => row.map(cell).join(","))
            .join("\r\n") + "\r\n",
      };
    });
  }
  return { options, detail, submit, review, reopen, exportCsv };
}
