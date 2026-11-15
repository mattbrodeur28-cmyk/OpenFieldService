import { createCompanySettings } from "../service/company.mjs";
import { setWorkCategory, workCategories } from "../service/work.mjs";
import { createOperatingHours } from "./hours.mjs";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { installDispatch, transaction, dispatchError } from "./storage.mjs";
import {
  validDate,
  timeMinute,
  validZonedInterval,
  zonedDay,
} from "./time.mjs";
const activeStatuses = ["scheduled", "confirmed", "in_progress"];
const admin = (user) =>
  user?.active &&
  !user.mustChangePassword &&
  ["owner", "admin"].includes(user.role);
const projection = `SELECT j.*,c.name AS customer_name,c.phone AS customer_phone,t.name AS technician_name,t.color AS technician_color,a.name AS equipment_name,a.serial_number AS equipment_serial,st.name AS service_type_name,ds.version AS schedule_version,ds.managed AS dispatch_managed,ds.is_emergency,COALESCE(sw.category,'unspecified') AS work_category FROM jobs j JOIN customers c ON c.id=j.customer_id LEFT JOIN technicians t ON t.id=j.technician_id LEFT JOIN assets a ON a.id=j.asset_id LEFT JOIN service_types st ON st.id=j.service_type_id JOIN _dispatch_job_state ds ON ds.job_id=j.id LEFT JOIN _service_work sw ON sw.job_id=j.id`;
function scheduleRecord(job) {
  return Object.fromEntries(
    [
      "id",
      "technician_id",
      "scheduled_date",
      "scheduled_time",
      "duration",
      "status",
      "schedule_version",
      "is_emergency",
      "work_category",
    ].map((key) => [key, job[key]]),
  );
}
export function createDispatcher({ storage, env = process.env, currentUser }) {
  const db = storage.database;
  installDispatch(db);
  const operating = createOperatingHours(db);
  storage.schedulingState = (id) =>
    db
      .prepare("SELECT version,managed FROM _dispatch_job_state WHERE job_id=?")
      .get(id);
  const company = createCompanySettings({ storage, env });
  storage.companyTimeZone = company.timeZone;
  storage.validateSchedule = (job) =>
    validDate(job.scheduled_date) &&
    timeMinute(job.scheduled_time) !== null &&
    Number.isInteger(job.duration) &&
    job.duration >= 15 &&
    job.duration <= 1440 &&
    timeMinute(job.scheduled_time) + job.duration <= 1440 &&
    validZonedInterval(
      job.scheduled_date,
      timeMinute(job.scheduled_time),
      job.duration,
      company.timeZone(),
    );
  const app = new Hono();
  let stopping = false;
  const actor = (c) => (currentUser ? currentUser(c) : c.get("user"));
  const revision = () =>
    db
      .prepare("SELECT COALESCE(MAX(id),0) AS revision FROM _dispatch_events")
      .get().revision;
  app.use(
    "*",
    bodyLimit({
      maxSize: 20000,
      onError: (c) => c.json({ error: "Request too large." }, 413),
    }),
  );
  app.use("*", async (c, next) => {
    const user = actor(c);
    if (!user || !user.active)
      return c.json({ error: "Sign in to continue." }, 401);
    if (user.mustChangePassword)
      return c.json(
        { error: "Change your temporary password before continuing." },
        403,
      );
    if (
      c.req.method !== "GET" &&
      (user.role === "viewer" ||
        c.req.header("X-Requested-With") !== "OpenFieldService")
    )
      return c.json({ error: "Your account cannot change the schedule." }, 403);
    return next();
  });
  app.onError((error, c) => {
    const conflict = dispatchError(error);
    if (conflict) return c.json({ error: conflict, code: "conflict" }, 409);
    console.error("Dispatcher request failed:", error.name);
    return c.json(
      { error: "The dispatcher operation could not be completed." },
      500,
    );
  });
  async function input(c) {
    try {
      return await c.req.json();
    } catch {
      return null;
    }
  }
  app.get("/board", (c) => {
    const date = c.req.query("date") || zonedDay(company.timeZone()),
      search = (c.req.query("search") || "").slice(0, 200);
    const bucket = c.req.query("pipeline") || "all";
    const assigned = c.req.query("assignment") || "all";
    const page = Number(c.req.query("page") || 1);
    if (
      !validDate(date) ||
      !["all", "open", "active"].includes(bucket) ||
      !["all", "assigned", "unassigned"].includes(assigned) ||
      !Number.isSafeInteger(page) ||
      page < 1
    )
      return c.json(
        { error: "Choose a valid date, page and pipeline filter." },
        400,
      );
    const board = transaction(db, () => {
      const resources = db
        .prepare(
          `SELECT t.*,COALESCE(p.dispatch_team,'') AS dispatch_team,COALESCE(p.territory,'') AS territory,COALESCE(p.skills,'[]') AS skills,COALESCE(p.version,0) AS profile_version,av.available,av.start_minute,av.end_minute FROM technicians t LEFT JOIN _dispatch_profiles p ON p.technician_id=t.id LEFT JOIN _dispatch_availability av ON av.technician_id=t.id AND av.date=? ORDER BY t.active DESC,t.name LIMIT 501`,
        )
        .all(date)
        .map((row) => ({
          ...row,
          skills: JSON.parse(row.skills),
          availability:
            row.available === null
              ? null
              : {
                  available: Boolean(row.available),
                  start: row.start_minute,
                  end: row.end_minute,
                },
        }));
      const scheduledJobs = db
        .prepare(
          projection +
            " WHERE j.scheduled_date=? AND j.technician_id IS NOT NULL ORDER BY j.scheduled_time,j.identifier LIMIT 2001",
        )
        .all(date);
      const actual = storage.actualAppointments?.(date, company.timeZone()) || {
        slots: [],
        replacedJobIds: [],
        overflow: false,
      };
      const replaced = new Set(actual.replacedJobIds);
      const jobs = scheduledJobs.filter((job) => !replaced.has(job.id));
      const byId = db.prepare(projection + " WHERE j.id=?");
      for (const slot of actual.slots) {
        const source = byId.get(slot.jobId);
        if (source)
          jobs.push({
            ...source,
            ...slot,
            planned_schedule: {
              date: source.scheduled_date,
              time: source.scheduled_time,
              duration: source.duration,
              technicianId: source.technician_id,
            },
          });
      }
      jobs.sort(
        (a, b) =>
          a.scheduled_time.localeCompare(b.scheduled_time) ||
          a.identifier.localeCompare(b.identifier),
      );
      if (
        resources.length > 500 ||
        scheduledJobs.length > 2000 ||
        jobs.length > 2000 ||
        actual.overflow
      )
        return null;
      const statuses =
        bucket === "open"
          ? ["scheduled", "confirmed"]
          : bucket === "active"
            ? ["in_progress"]
            : activeStatuses;
      const where = `${assigned === "unassigned" ? "j.technician_id IS NULL AND " : assigned === "assigned" ? "j.technician_id IS NOT NULL AND " : ""}j.status IN (${statuses.map(() => "?").join(",")}) AND instr(lower(j.identifier || ' ' || c.name || ' ' || j.address || ' ' || COALESCE(a.name,'') || ' ' || COALESCE(a.serial_number,'')),lower(?))>0`;
      const total = db
        .prepare(
          `SELECT COUNT(*) AS n FROM jobs j JOIN customers c ON c.id=j.customer_id LEFT JOIN assets a ON a.id=j.asset_id WHERE ${where}`,
        )
        .get(...statuses, search).n;
      const pipeline = db
        .prepare(
          projection +
            ` WHERE ${where} ORDER BY (j.technician_id IS NOT NULL),CASE j.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,j.scheduled_date,j.scheduled_time,j.identifier LIMIT 25 OFFSET ?`,
        )
        .all(...statuses, search, (page - 1) * 25);
      const operatingHours = operating.forDate(date);
      return {
        operatingHours,
        date,
        timeZone: company.timeZone(),
        now: new Date().toISOString(),
        revision: revision(),
        resources,
        jobs: jobs.map((job) => ({
          ...job,
          outside_service_hours: operating.outside(job, operatingHours),
        })),
        pipeline,
        pipelineTotal: total,
        page,
        pageSize: 25,
      };
    });
    return board
      ? c.json(board)
      : c.json(
          {
            error:
              "This board exceeds 500 resources or 2,000 appointments. Narrow the operating scope before using Dispatcher.",
          },
          422,
        );
  });
  app.put("/assignments/:id", async (c) => {
    const data = await input(c),
      user = actor(c);
    if (!user?.active || user.mustChangePassword || user.role === "viewer")
      return c.json({ error: "Your permissions changed. Sign in again." }, 403);
    if (
      !data ||
      !validDate(data.date) ||
      timeMinute(data.time) === null ||
      !Number.isInteger(data.duration) ||
      data.duration < 15 ||
      data.duration > 1440 ||
      !Number.isSafeInteger(data.expectedVersion) ||
      data.expectedVersion < 0 ||
      !(data.technicianId === null || typeof data.technicianId === "string") ||
      (data.override !== undefined && typeof data.override !== "boolean") ||
      (data.emergency !== undefined && typeof data.emergency !== "boolean") ||
      (data.workCategory !== undefined &&
        !workCategories.includes(data.workCategory))
    )
      return c.json(
        {
          error:
            "Choose a date, time, technician, version and duration of 15–1,440 minutes.",
        },
        400,
      );
    const minute = timeMinute(data.time);
    if (
      minute + data.duration > 1440 ||
      !validZonedInterval(data.date, minute, data.duration, company.timeZone())
    )
      return c.json(
        {
          error:
            "Choose an unambiguous interval within one day. Split work that crosses a daylight-saving transition.",
        },
        400,
      );
    if (
      data.override &&
      (!admin(user) ||
        typeof data.reason !== "string" ||
        data.reason.trim().length < 10 ||
        data.reason.length > 1000)
    )
      return c.json(
        {
          error:
            "An Owner/Admin and an override reason of 10–1,000 characters are required.",
        },
        403,
      );
    const result = transaction(db, () => {
      const before = db
        .prepare(projection + " WHERE j.id=?")
        .get(c.req.param("id"));
      if (!before) return { status: 404, error: "Job not found." };
      if (before.schedule_version !== data.expectedVersion)
        return {
          status: 409,
          error:
            "This job changed in another session. Reload and review before trying again.",
          code: "stale",
          currentVersion: before.schedule_version,
        };
      if (!activeStatuses.includes(before.status))
        return {
          status: 409,
          error: "Completed or cancelled jobs cannot be rescheduled.",
        };
      if (
        data.technicianId !== null &&
        !db
          .prepare("SELECT id FROM technicians WHERE id=? AND active=1")
          .get(data.technicianId)
      )
        return { status: 400, error: "Choose an active technician." };
      const category =
        data.workCategory ??
        (data.emergency === true
          ? "on_demand"
          : data.emergency === false && before.work_category === "on_demand"
            ? "unspecified"
            : before.work_category);
      if (
        data.workCategory !== undefined &&
        data.emergency !== undefined &&
        data.emergency !== (category === "on_demand")
      )
        return {
          status: 400,
          error:
            "On-Demand is the emergency/T&M category. Choose a consistent work category.",
        };
      setWorkCategory(db, user, before.id, category);
      const emergency = category === "on_demand";
      const signature =
        data.override && data.technicianId
          ? `${data.technicianId}|${data.date}|${data.time}|${data.duration}`
          : "";
      db.prepare(
        "UPDATE _dispatch_job_state SET managed=1,override_signature=?,is_emergency=? WHERE job_id=?",
      ).run(signature, Number(emergency), before.id);
      db.prepare(
        "UPDATE jobs SET technician_id=?,scheduled_date=?,scheduled_time=?,duration=?,updated_at=datetime('now') WHERE id=?",
      ).run(data.technicianId, data.date, data.time, data.duration, before.id);
      const after = db.prepare(projection + " WHERE j.id=?").get(before.id);
      const audit = db
        .prepare(
          "INSERT INTO _dispatch_audit(actor_id,job_id,action,before_json,after_json,reason) VALUES(?,?,?,?,?,?)",
        )
        .run(
          user.id,
          before.id,
          data.technicianId === null
            ? "unassign"
            : data.override
              ? "override"
              : "assign",
          JSON.stringify(scheduleRecord(before)),
          JSON.stringify(scheduleRecord(after)),
          data.override ? data.reason.trim() : "",
        );
      return {
        status: 200,
        job: after,
        revision: revision(),
        auditId: Number(audit.lastInsertRowid),
      };
    });
    const { status, ...response } = result;
    return c.json(response, status);
  });
  app.put("/resources/:id", async (c) => {
    const data = await input(c),
      user = actor(c),
      id = c.req.param("id");
    if (!admin(user) || user.mustChangePassword)
      return c.json({ error: "Owner or administrator access required." }, 403);
    if (
      !data ||
      !validDate(data.date) ||
      !Number.isSafeInteger(data.expectedVersion) ||
      data.expectedVersion < 0 ||
      typeof data.dispatchTeam !== "string" ||
      data.dispatchTeam.length > 80 ||
      typeof data.territory !== "string" ||
      data.territory.length > 80 ||
      !Array.isArray(data.skills) ||
      data.skills.length > 20 ||
      data.skills.some(
        (value) =>
          typeof value !== "string" || !value.trim() || value.length > 60,
      ) ||
      !(
        data.availability === null ||
        (data.availability &&
          typeof data.availability.available === "boolean" &&
          Number.isInteger(data.availability.start) &&
          Number.isInteger(data.availability.end) &&
          data.availability.start >= 0 &&
          data.availability.start < data.availability.end &&
          data.availability.end <= 1440)
      )
    )
      return c.json(
        { error: "Invalid resource profile or declared availability." },
        400,
      );
    const result = transaction(db, () => {
      if (!db.prepare("SELECT id FROM technicians WHERE id=?").get(id))
        return { status: 404, error: "Technician not found." };
      const old = db
        .prepare("SELECT version FROM _dispatch_profiles WHERE technician_id=?")
        .get(id);
      if ((old?.version || 0) !== data.expectedVersion)
        return {
          status: 409,
          error: "This resource changed. Reload before saving.",
        };
      if (data.availability) {
        const jobs = db
          .prepare(
            "SELECT * FROM jobs WHERE technician_id=? AND scheduled_date=? AND status IN ('scheduled','confirmed','in_progress')",
          )
          .all(id, data.date);
        if (
          jobs.some(
            (job) =>
              !data.availability.available ||
              timeMinute(job.scheduled_time) < data.availability.start ||
              timeMinute(job.scheduled_time) + job.duration >
                data.availability.end,
          )
        )
          return {
            status: 409,
            error:
              "Existing appointments fall outside this availability. Reschedule them first.",
          };
      }
      db.prepare(
        "INSERT INTO _dispatch_profiles(technician_id,dispatch_team,territory,skills,version) VALUES(?,?,?,?,1) ON CONFLICT(technician_id) DO UPDATE SET dispatch_team=excluded.dispatch_team,territory=excluded.territory,skills=excluded.skills,version=version+1",
      ).run(
        id,
        data.dispatchTeam.trim(),
        data.territory.trim(),
        JSON.stringify([...new Set(data.skills.map((value) => value.trim()))]),
      );
      if (data.availability === null)
        db.prepare(
          "DELETE FROM _dispatch_availability WHERE technician_id=? AND date=?",
        ).run(id, data.date);
      else
        db.prepare(
          "INSERT INTO _dispatch_availability(technician_id,date,available,start_minute,end_minute) VALUES(?,?,?,?,?) ON CONFLICT(technician_id,date) DO UPDATE SET available=excluded.available,start_minute=excluded.start_minute,end_minute=excluded.end_minute",
        ).run(
          id,
          data.date,
          Number(data.availability.available),
          data.availability.start,
          data.availability.end,
        );
      db.prepare(
        "INSERT INTO _dispatch_events(entity_id,kind) VALUES(?,'resource')",
      ).run(id);
      return { status: 200, ok: true, revision: revision() };
    });
    const { status, ...response } = result;
    return c.json(response, status);
  });
  app.get("/operating-hours", (c) =>
    c.json({ ...operating.configuration(), timeZone: company.timeZone() }),
  );
  app.put("/operating-hours", async (c) => {
    const data = await input(c),
      user = actor(c);
    if (!admin(user))
      return c.json({ error: "Owner or administrator access required." }, 403);
    const { status, ...result } = operating.save(user, data);
    return c.json(result, status);
  });
  app.get("/audit", (c) => {
    if (!admin(actor(c)))
      return c.json({ error: "Administrator access required." }, 403);
    return c.json({
      events: db
        .prepare("SELECT * FROM _dispatch_audit ORDER BY id DESC LIMIT 100")
        .all(),
    });
  });
  app.get("/changes", (c) => {
    const after = Number(c.req.query("after") || 0);
    if (!Number.isSafeInteger(after) || after < 0)
      return c.json({ error: "Invalid revision." }, 400);
    return c.json({ revision: revision(), changed: revision() !== after });
  });
  app.get("/events", (c) => {
    const after = Number(
      c.req.header("Last-Event-ID") || c.req.query("after") || 0,
    );
    if (!Number.isSafeInteger(after) || after < 0)
      return c.json({ error: "Invalid revision." }, 400);
    c.header("X-Accel-Buffering", "no");
    c.header("Cache-Control", "no-cache, no-transform");
    return streamSSE(
      c,
      async (stream) => {
        let cursor = after,
          beats = 0;
        while (!stream.aborted && !stopping) {
          const user = actor(c);
          if (!user || !user.active || user.mustChangePassword) break;
          const latest = revision();
          if (latest !== cursor) {
            cursor = latest;
            await stream.writeSSE({
              event: "schedule",
              id: String(cursor),
              data: JSON.stringify({ revision: cursor }),
            });
          } else if (beats++ % 10 === 0)
            await stream.writeSSE({
              event: "heartbeat",
              data: JSON.stringify({ revision: cursor }),
            });
          await stream.sleep(1000);
        }
      },
      () => {},
    );
  });
  return {
    app,
    get timeZone() {
      return company.timeZone();
    },
    close() {
      stopping = true;
    },
  };
}
