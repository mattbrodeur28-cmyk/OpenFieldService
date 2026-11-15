import { z } from "zod";
import { migrate, transaction } from "../platform/sqlite.mjs";
import { ServiceIdentityError } from "./identity.mjs";
import { validZonedInterval, timeMinute } from "../dispatch/time.mjs";
const sql = `
CREATE TABLE _company_settings(company_id TEXT PRIMARY KEY CHECK(company_id='default'),time_zone TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0);
CREATE TABLE _company_settings_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,company_id TEXT NOT NULL REFERENCES _company_settings(company_id),actor_id TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`;
function zone(value) {
  if (typeof value !== "string" || !value || value.length > 100)
    throw new ServiceIdentityError(
      "Choose a valid IANA timezone, such as America/New_York.",
    );
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).resolvedOptions().timeZone;
  } catch {
    throw new ServiceIdentityError(
      "Choose a valid IANA timezone, such as America/New_York.",
    );
  }
}
const input = z
  .object({
    expectedVersion: z.number().int().nonnegative().safe(),
    timeZone: z.string().min(1).max(100),
    reason: z.string().trim().min(10).max(1000),
    acknowledgeScheduleTimes: z.literal(true),
  })
  .strict();
export function createCompanySettings({ storage, env = process.env }) {
  const db = storage.database;
  migrate(db, "_company_settings_migrations", [{ version: 1, sql }]);
  if (
    !db
      .prepare("SELECT 1 FROM _company_settings WHERE company_id='default'")
      .get()
  ) {
    const initial = zone(
      env.COMPANY_TIMEZONE || env.DISPATCH_TIMEZONE || "UTC",
    );
    db.prepare(
      "INSERT OR IGNORE INTO _company_settings(company_id,time_zone) VALUES('default',?)",
    ).run(initial);
  }
  const read = () => {
    const row = db
      .prepare(
        "SELECT time_zone,version FROM _company_settings WHERE company_id='default'",
      )
      .get();
    return { timeZone: row.time_zone, version: row.version };
  };
  function save(user, raw) {
    if (
      !user?.active ||
      user.mustChangePassword ||
      !["owner", "admin"].includes(user.role)
    )
      throw new ServiceIdentityError(
        "Owner or administrator access required.",
        403,
      );
    const result = input.safeParse(raw);
    if (!result.success)
      throw new ServiceIdentityError(
        "Choose a timezone, provide a reason of at least 10 characters, and acknowledge the effect on schedules.",
      );
    const data = result.data,
      timeZone = zone(data.timeZone);
    return transaction(db, () => {
      const before = read();
      if (before.version !== data.expectedVersion)
        throw new ServiceIdentityError(
          "Company settings changed. Reload before saving.",
          409,
        );
      if (timeZone === before.timeZone) return before;
      // Scheduled times are wall-clock values; refuse a change that would make existing active assignments invalid.
      const jobs = db
        .prepare(
          "SELECT scheduled_date,scheduled_time,duration FROM jobs WHERE technician_id IS NOT NULL AND status IN ('scheduled','confirmed','in_progress') LIMIT 10001",
        )
        .all();
      if (jobs.length > 10000)
        throw new ServiceIdentityError(
          "This schedule needs a planned timezone migration; contact your administrator.",
          422,
        );
      if (
        jobs.some(
          (j) =>
            !validZonedInterval(
              j.scheduled_date,
              timeMinute(j.scheduled_time),
              j.duration,
              timeZone,
            ),
        )
      )
        throw new ServiceIdentityError(
          "The new timezone makes an existing active appointment ambiguous or invalid. Review those appointments before changing the company timezone.",
          409,
        );
      db.prepare(
        "UPDATE _company_settings SET time_zone=?,version=version+1 WHERE company_id='default'",
      ).run(timeZone);
      const after = read();
      db.prepare(
        "INSERT INTO _company_settings_audit(company_id,actor_id,before_json,after_json,reason) VALUES('default',?,?,?,?)",
      ).run(
        user.id,
        JSON.stringify(before),
        JSON.stringify({ ...after, activeAssignments: jobs.length }),
        data.reason,
      );
      if (
        db
          .prepare(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='_dispatch_events'",
          )
          .get()
      )
        db.prepare(
          "INSERT INTO _dispatch_events(entity_id,kind) VALUES('company','timezone')",
        ).run();
      return after;
    });
  }
  return { read, save, timeZone: () => read().timeZone };
}
