import { z } from "zod";
import { transaction } from "../platform/sqlite.mjs";
import { validDate, timeMinute } from "./time.mjs";
const minute = z.number().int().min(0).max(1440);
const interval = { open: z.boolean(), start: minute, end: minute };
const rule = z
  .object({ weekday: z.number().int().min(0).max(6), ...interval })
  .strict()
  .refine((v) => v.start < v.end, "Start must be before end.");
const exception = z
  .object({
    date: z.string().refine(validDate, "Choose a valid date."),
    label: z.string().trim().min(1).max(120),
    ...interval,
  })
  .strict()
  .refine((v) => v.start < v.end, "Start must be before end.");
const schema = z
  .object({
    enabled: z.boolean(),
    expectedVersion: z.number().int().nonnegative().safe(),
    weekly: z.array(rule).length(7),
    exceptions: z.array(exception).max(100),
  })
  .strict()
  .refine(
    (v) => new Set(v.weekly.map((d) => d.weekday)).size === 7,
    "Define each weekday exactly once.",
  )
  .refine(
    (v) =>
      new Set(v.exceptions.map((d) => d.date)).size === v.exceptions.length,
    "Only one exception per date.",
  );
export const hoursMigration = `
ALTER TABLE _dispatch_job_state ADD COLUMN is_emergency INTEGER NOT NULL DEFAULT 0 CHECK(is_emergency IN (0,1));
CREATE TABLE _dispatch_operating_settings(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 0);
INSERT INTO _dispatch_operating_settings(id) VALUES(1);
CREATE TABLE _dispatch_operating_weekly(weekday INTEGER PRIMARY KEY CHECK(weekday BETWEEN 0 AND 6),open INTEGER NOT NULL,start INTEGER NOT NULL,end INTEGER NOT NULL);
INSERT INTO _dispatch_operating_weekly VALUES(0,0,480,1020),(1,1,480,1020),(2,1,480,1020),(3,1,480,1020),(4,1,480,1020),(5,1,480,1020),(6,0,480,1020);
CREATE TABLE _dispatch_operating_exceptions(date TEXT PRIMARY KEY,label TEXT NOT NULL,open INTEGER NOT NULL,start INTEGER NOT NULL,end INTEGER NOT NULL);
CREATE TABLE _dispatch_operating_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE VIEW _dispatch_effective_job_hours AS SELECT j.id,COALESCE(x.open,w.open) AS open,COALESCE(x.start,w.start) AS start,COALESCE(x.end,w.end) AS end FROM jobs j JOIN _dispatch_operating_weekly w ON w.weekday=CAST(strftime('%w',j.scheduled_date) AS INTEGER) LEFT JOIN _dispatch_operating_exceptions x ON x.date=j.scheduled_date;
CREATE TRIGGER _dispatch_hours_update BEFORE UPDATE OF technician_id,scheduled_date,scheduled_time,duration,status ON jobs
WHEN (SELECT enabled FROM _dispatch_operating_settings WHERE id=1)=1 AND NEW.technician_id IS NOT NULL AND NEW.status IN ('scheduled','confirmed','in_progress')
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM _dispatch_operating_weekly w LEFT JOIN _dispatch_operating_exceptions x ON x.date=NEW.scheduled_date WHERE w.weekday=CAST(strftime('%w',NEW.scheduled_date) AS INTEGER) AND COALESCE(x.open,w.open)=1 AND CAST(substr(NEW.scheduled_time,1,2) AS INTEGER)*60+CAST(substr(NEW.scheduled_time,4,2) AS INTEGER)>=COALESCE(x.start,w.start) AND CAST(substr(NEW.scheduled_time,1,2) AS INTEGER)*60+CAST(substr(NEW.scheduled_time,4,2) AS INTEGER)+NEW.duration<=COALESCE(x.end,w.end)) AND NOT EXISTS(SELECT 1 FROM _dispatch_job_state s WHERE s.job_id=NEW.id AND s.is_emergency=1 AND s.override_signature=NEW.technician_id||'|'||NEW.scheduled_date||'|'||NEW.scheduled_time||'|'||NEW.duration) THEN RAISE(ABORT,'DISPATCH_SERVICE_HOURS') END;
END;
CREATE TRIGGER _dispatch_hours_insert AFTER INSERT ON jobs
WHEN (SELECT enabled FROM _dispatch_operating_settings WHERE id=1)=1 AND NEW.technician_id IS NOT NULL AND NEW.status IN ('scheduled','confirmed','in_progress')
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM _dispatch_effective_job_hours h WHERE h.id=NEW.id AND h.open=1 AND CAST(substr(NEW.scheduled_time,1,2) AS INTEGER)*60+CAST(substr(NEW.scheduled_time,4,2) AS INTEGER)>=h.start AND CAST(substr(NEW.scheduled_time,1,2) AS INTEGER)*60+CAST(substr(NEW.scheduled_time,4,2) AS INTEGER)+NEW.duration<=h.end) THEN RAISE(ABORT,'DISPATCH_SERVICE_HOURS') END;
END;
`;
export function createOperatingHours(db) {
  function configuration() {
    const settings = db
      .prepare(
        "SELECT enabled,version FROM _dispatch_operating_settings WHERE id=1",
      )
      .get();
    return {
      ...settings,
      enabled: Boolean(settings.enabled),
      weekly: db
        .prepare("SELECT * FROM _dispatch_operating_weekly ORDER BY weekday")
        .all()
        .map((r) => ({ ...r, open: Boolean(r.open) })),
      exceptions: db
        .prepare("SELECT * FROM _dispatch_operating_exceptions ORDER BY date")
        .all()
        .map((r) => ({ ...r, open: Boolean(r.open) })),
    };
  }
  function forDate(date) {
    const settings = db
      .prepare(
        "SELECT enabled,version FROM _dispatch_operating_settings WHERE id=1",
      )
      .get();
    const special = db
      .prepare("SELECT * FROM _dispatch_operating_exceptions WHERE date=?")
      .get(date);
    const weekly = db
      .prepare("SELECT * FROM _dispatch_operating_weekly WHERE weekday=?")
      .get(new Date(date + "T12:00:00Z").getUTCDay());
    return {
      enabled: Boolean(settings.enabled),
      version: settings.version,
      open: !settings.enabled || Boolean((special || weekly).open),
      start: settings.enabled ? (special || weekly).start : 0,
      end: settings.enabled ? (special || weekly).end : 1440,
      label: settings.enabled
        ? special?.label || "Weekly service hours"
        : "Service hours not enforced",
      exception: Boolean(special),
    };
  }
  function outside(job, hours) {
    return (
      hours.enabled &&
      (!hours.open ||
        timeMinute(job.scheduled_time) < hours.start ||
        timeMinute(job.scheduled_time) + job.duration > hours.end)
    );
  }
  function save(user, input) {
    const parsed = schema.safeParse(input);
    if (!parsed.success)
      return {
        status: 400,
        error: parsed.error.issues.map((i) => i.message).join("; "),
      };
    const data = parsed.data;
    return transaction(db, () => {
      const before = configuration();
      if (before.version !== data.expectedVersion)
        return {
          status: 409,
          error: "Service hours changed. Close and reopen before saving.",
        };
      db.prepare(
        "UPDATE _dispatch_operating_settings SET enabled=?,version=version+1 WHERE id=1",
      ).run(Number(data.enabled));
      for (const day of data.weekly)
        db.prepare(
          "UPDATE _dispatch_operating_weekly SET open=?,start=?,end=? WHERE weekday=?",
        ).run(Number(day.open), day.start, day.end, day.weekday);
      db.exec("DELETE FROM _dispatch_operating_exceptions");
      for (const day of data.exceptions)
        db.prepare(
          "INSERT INTO _dispatch_operating_exceptions(date,label,open,start,end) VALUES(?,?,?,?,?)",
        ).run(day.date, day.label, Number(day.open), day.start, day.end);
      const after = configuration();
      db.prepare(
        "INSERT INTO _dispatch_operating_audit(actor_id,before_json,after_json) VALUES(?,?,?)",
      ).run(user.id, JSON.stringify(before), JSON.stringify(after));
      db.prepare(
        "INSERT INTO _dispatch_events(entity_id,kind) VALUES('company','operating-hours')",
      ).run();
      return { status: 200, configuration: after };
    });
  }
  return { configuration, forDate, outside, save };
}
