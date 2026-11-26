import { randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "../platform/sqlite.mjs";
import { CrmError, parse, requireReader, requireWriter, version } from "./domain.mjs";

// CRM-004 application service: customer-scoped tasks, follow-ups and notes.
// `visibility` separates internal records from customer-facing communication records;
// no external message is sent by these commands.
const instant = z
  .string()
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)), "Choose a valid date and time.")
  .transform((value) => new Date(value).toISOString());

const input = z
  .object({
    kind: z.enum(["note", "task", "follow_up"]),
    visibility: z.enum(["private", "customer_visible"]).default("private"),
    title: z.string().trim().min(1).max(200),
    details: z.string().trim().max(8000).default(""),
    assigneeId: z.string().trim().max(100).default(""),
    dueAt: instant.nullable().default(null),
    reminderAt: instant.nullable().default(null),
    status: z.enum(["open", "done"]).default("open"),
    outcome: z.string().trim().max(4000).default(""),
    expectedVersion: version.optional(),
  })
  .strict()
  .refine((v) => !v.reminderAt || !v.dueAt || v.reminderAt <= v.dueAt, "A reminder must be at or before the due time.")
  .refine((v) => v.status !== "done" || v.outcome.length >= 3, "Record an outcome or completion reason of at least 3 characters.")
  .refine((v) => v.kind !== "note" || (v.assigneeId === "" && v.dueAt === null && v.reminderAt === null && v.status === "done"), "Notes have no assignee, due date or reminder and are recorded as done.")
  .refine((v) => v.kind === "note" || (v.assigneeId !== "" && v.dueAt !== null), "Tasks and follow-ups need an assignee and a due date.");

const projection = `SELECT a.id,a.customer_id AS customerId,a.kind,a.visibility,a.title,a.details,a.assignee_id AS assigneeId,a.due_at AS dueAt,a.reminder_at AS reminderAt,a.status,a.outcome,a.version,a.created_by AS createdBy,a.completed_by AS completedBy,a.completed_at AS completedAt,a.created_at AS createdAt,a.updated_at AS updatedAt FROM _crm_activities a`;

export function createCrmActivities({ storage, customer, audit, people = () => [], clock = () => new Date() }) {
  const db = storage.database;
  const shape = (row) => (row ? { ...row } : null);
  const get = (id) => {
    const row = db.prepare(projection + " WHERE a.id=?").get(id);
    if (!row) throw new CrmError("Activity not found.", 404);
    return shape(row);
  };

  function save(user, customerId, id, body) {
    requireWriter(user);
    const data = parse(input, body);
    return transaction(db, () => {
      customer(customerId);
      const old = id ? get(id) : null;
      if (old && old.customerId !== customerId)
        throw new CrmError("Activity does not belong to this customer.", 404);
      if (old && data.expectedVersion !== old.version)
        throw new CrmError("This activity changed. Reload and review before saving.", 409);
      if (data.assigneeId && !people().some((person) => person.id === data.assigneeId))
        throw new CrmError("Choose an active activity assignee.");
      const activityId = id || randomUUID();
      const completed = data.status === "done";
      const completedBy = completed ? (old?.status === "done" ? old.completedBy : user.id) : null;
      const completedAt = completed ? (old?.status === "done" ? old.completedAt : clock().toISOString()) : null;
      const values = [data.kind, data.visibility, data.title, data.details, data.assigneeId, data.dueAt, data.reminderAt, data.status, data.outcome, completedBy, completedAt];
      if (old)
        db.prepare("UPDATE _crm_activities SET kind=?,visibility=?,title=?,details=?,assignee_id=?,due_at=?,reminder_at=?,status=?,outcome=?,completed_by=?,completed_at=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?").run(...values, activityId, data.expectedVersion);
      else
        db.prepare("INSERT INTO _crm_activities(kind,visibility,title,details,assignee_id,due_at,reminder_at,status,outcome,completed_by,completed_at,id,customer_id,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(...values, activityId, customerId, user.id);
      const result = get(activityId);
      audit(user, "activity", activityId, old ? "update" : "create", old, result);
      return { activity: result };
    });
  }

  function list(user, customerId, query = {}) {
    requireReader(user);
    customer(customerId);
    const page = Number(query.page || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000)
      throw new CrmError("Choose a valid activity page.");
    const where = ["a.customer_id=?"], params = [customerId];
    for (const field of ["status", "visibility", "kind"])
      if (query[field] && query[field] !== "all") {
        where.push(`a.${field}=?`);
        params.push(query[field]);
      }
    const base = projection + " WHERE " + where.join(" AND ");
    return transaction(db, () => ({
      activities: db.prepare(base + " ORDER BY COALESCE(a.due_at,a.created_at) DESC,a.id LIMIT 50 OFFSET ?").all(...params, (page - 1) * 50).map(shape),
      total: db.prepare("SELECT COUNT(*) AS n FROM (" + base + ")").get(...params).n,
      page,
      pageSize: 50,
      now: clock().toISOString(),
    }));
  }

  function reminders(user) {
    requireReader(user);
    const now = clock().toISOString();
    return transaction(db, () => ({
      activities: db.prepare(projection + " WHERE a.assignee_id=? AND a.status='open' AND a.reminder_at<=? ORDER BY a.due_at,a.id LIMIT 50").all(user.id, now).map(shape),
      total: db.prepare("SELECT COUNT(*) AS n FROM _crm_activities WHERE assignee_id=? AND status='open' AND reminder_at<=?").get(user.id, now).n,
      now,
    }));
  }

  return { save, list, reminders };
}
