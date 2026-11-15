import { randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "../platform/sqlite.mjs";
import { audit } from "./storage.mjs";
import {
  SalesError,
  parse,
  version,
  date,
  requireWriter,
  isSalesAdmin,
} from "./domain.mjs";
const instant = z
  .string()
  .datetime({ offset: true })
  .refine(
    (value) =>
      Number.isFinite(Date.parse(value)) &&
      date.safeParse(value.slice(0, 10)).success,
    "Choose a valid date and time.",
  )
  .transform((value) => new Date(value).toISOString());
const input = z
  .object({
    kind: z.enum(["call", "meeting", "site_survey", "task"]),
    title: z.string().trim().min(1).max(200),
    details: z.string().trim().max(8000),
    assigneeId: z.string().min(1).max(100),
    dueAt: instant,
    reminderAt: instant,
    status: z.enum(["open", "done", "cancelled"]),
    outcome: z.string().trim().max(4000),
    messageId: z.string().uuid().nullable(),
    expectedVersion: version.optional(),
    expectedOpportunityVersion: version.optional(),
  })
  .strict()
  .refine(
    (value) => value.reminderAt <= value.dueAt,
    "A reminder must be at or before the due time.",
  )
  .refine(
    (value) => value.status === "open" || value.outcome.length >= 3,
    "Record an outcome or cancellation reason of at least 3 characters.",
  );
const projection = `SELECT a.*,o.title AS opportunity_title,o.owner_id AS opportunity_owner_id,o.customer_id,o.prospect_name,c.name AS customer_name FROM _sales_activities a JOIN _sales_opportunities o ON o.id=a.opportunity_id LEFT JOIN customers c ON c.id=o.customer_id`;
export function createActivities({
  storage,
  sales,
  owners,
  resolveMessage = () => null,
  clock = () => new Date(),
}) {
  const db = storage.database;
  const get = (id) => {
    const row = db.prepare(projection + " WHERE a.id=?").get(id);
    if (!row) throw new SalesError("Sales activity not found.", 404);
    return row;
  };
  function save(user, opportunityId, id, body) {
    requireWriter(user);
    const data = parse(input, body);
    return transaction(db, () => {
      const opportunity = sales.opportunity(opportunityId),
        old = id ? get(id) : null;
      if (old && old.opportunity_id !== opportunityId)
        throw new SalesError(
          "Activity does not belong to this opportunity.",
          404,
        );
      if (
        !isSalesAdmin(user) &&
        opportunity.owner_id !== user.id &&
        old?.assignee_id !== user.id
      )
        throw new SalesError(
          "Only the opportunity owner, activity assignee or an administrator can change this activity.",
          403,
        );
      if (
        old
          ? data.expectedVersion !== old.version
          : data.expectedOpportunityVersion !== opportunity.version
      )
        throw new SalesError(
          "This activity or opportunity changed. Reload and review before saving.",
          409,
        );
      if (!owners().some((person) => person.id === data.assigneeId))
        throw new SalesError("Choose an active activity assignee.");
      if (
        !isSalesAdmin(user) &&
        data.assigneeId !== user.id &&
        data.assigneeId !== old?.assignee_id
      )
        throw new SalesError(
          "Only administrators can assign activities to another user.",
          403,
        );
      let teamId = old?.team_id || null;
      if (data.messageId !== old?.message_id && data.messageId !== null) {
        const reference = resolveMessage(user, data.messageId);
        if (!reference)
          throw new SalesError(
            "Choose a team message you are permitted to read.",
            403,
          );
        teamId = reference.teamId;
      }
      if (data.messageId === null) teamId = null;
      const activityId = id || randomUUID(),
        completed = data.status === "done",
        completedBy = completed
          ? old?.status === "done"
            ? old.completed_by
            : user.id
          : null,
        completedAt = completed
          ? old?.status === "done"
            ? old.completed_at
            : clock().toISOString()
          : null;
      const values = [
        data.kind,
        data.title,
        data.details,
        data.assigneeId,
        data.dueAt,
        data.reminderAt,
        data.status,
        data.outcome,
        teamId,
        data.messageId,
        completedBy,
        completedAt,
      ];
      if (old)
        db.prepare(
          "UPDATE _sales_activities SET kind=?,title=?,details=?,assignee_id=?,due_at=?,reminder_at=?,status=?,outcome=?,team_id=?,message_id=?,completed_by=?,completed_at=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?",
        ).run(...values, activityId, data.expectedVersion);
      else
        db.prepare(
          "INSERT INTO _sales_activities(kind,title,details,assignee_id,due_at,reminder_at,status,outcome,team_id,message_id,completed_by,completed_at,id,opportunity_id,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ).run(...values, activityId, opportunityId, user.id);
      db.prepare(
        "UPDATE _sales_opportunities SET version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(opportunityId);
      const result = get(activityId);
      audit(
        db,
        user,
        "activity",
        activityId,
        old ? "update" : "create",
        old,
        result,
      );
      audit(db, user, "opportunity", opportunityId, "activity", null, {
        activityId,
        title: result.title,
        status: result.status,
        action: old ? "updated" : "created",
      });
      return {
        activity: result,
        opportunity: sales.opportunity(opportunityId),
      };
    });
  }
  function list(user, query = {}) {
    const page = Number(query.page || 1),
      status = query.status || "open";
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 1000000 ||
      !["open", "done", "cancelled", "all"].includes(status)
    )
      throw new SalesError("Choose a valid activity page and status.");
    const where = ["1=1"],
      params = [];
    if (query.opportunityId) {
      sales.opportunity(query.opportunityId);
      where.push("a.opportunity_id=?");
      params.push(query.opportunityId);
    }
    if (status !== "all") {
      where.push("a.status=?");
      params.push(status);
    }
    const assignee = query.assignee || "me";
    if (assignee !== "all") {
      where.push("a.assignee_id=?");
      params.push(assignee === "me" ? user.id : assignee);
    }
    if (query.dueBefore) {
      const due = parse(instant, query.dueBefore);
      where.push("a.due_at<=?");
      params.push(due);
    }
    const base = projection + " WHERE " + where.join(" AND ");
    return transaction(db, () => ({
      activities: db
        .prepare(base + " ORDER BY a.due_at,a.id LIMIT 50 OFFSET ?")
        .all(...params, (page - 1) * 50),
      total: db
        .prepare("SELECT COUNT(*) AS n FROM (" + base + ")")
        .get(...params).n,
      page,
      pageSize: 50,
      now: clock().toISOString(),
    }));
  }
  function reminders(user) {
    const now = clock().toISOString();
    return transaction(db, () => ({
      activities: db
        .prepare(
          projection +
            " WHERE a.assignee_id=? AND a.status='open' AND a.reminder_at<=? ORDER BY a.due_at,a.id LIMIT 50",
        )
        .all(user.id, now),
      total: db
        .prepare(
          "SELECT COUNT(*) AS n FROM _sales_activities WHERE assignee_id=? AND status='open' AND reminder_at<=?",
        )
        .get(user.id, now).n,
      now,
    }));
  }
  return { save, list, reminders };
}
