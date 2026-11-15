import { z } from "zod";
import { migrate, transaction } from "../platform/sqlite.mjs";
const sql = `CREATE TABLE _service_technician_users(technician_id TEXT PRIMARY KEY REFERENCES technicians(id) ON DELETE RESTRICT,user_id TEXT UNIQUE,version INTEGER NOT NULL DEFAULT 1,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);CREATE TABLE _service_identity_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,technician_id TEXT NOT NULL,actor_id TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`;
export class ServiceIdentityError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const administrator = (user) =>
  Boolean(
    user?.active &&
      !user.mustChangePassword &&
      ["owner", "admin"].includes(user.role),
  );
const writer = (user) =>
  Boolean(
    user?.active &&
      !user.mustChangePassword &&
      ["owner", "admin", "member"].includes(user.role),
  );
const input = z
  .object({
    userId: z.string().uuid().nullable(),
    expectedVersion: z.number().int().nonnegative().safe(),
  })
  .strict();
export function createServiceIdentity({ storage, people }) {
  const db = storage.database;
  migrate(db, "_service_identity_migrations", [{ version: 1, sql }]);
  const projection =
    "SELECT t.id AS technician_id,t.name AS technician_name,t.active,link.user_id,COALESCE(link.version,0) AS version FROM technicians t LEFT JOIN _service_technician_users link ON link.technician_id=t.id";
  function configuration(user) {
    if (!administrator(user))
      throw new ServiceIdentityError(
        "Owner or administrator access required.",
        403,
      );
    return transaction(db, () => {
      const rows = db.prepare(projection + " ORDER BY t.name LIMIT 501").all(),
        users = people();
      if (rows.length > 500 || users.length > 500)
        throw new ServiceIdentityError(
          "Technician identity setup supports up to 500 technicians and eligible accounts. Narrow the company scope before continuing.",
          422,
        );
      return { technicians: rows, people: users };
    });
  }
  function save(user, id, body) {
    if (!administrator(user))
      throw new ServiceIdentityError(
        "Owner or administrator access required.",
        403,
      );
    const parsed = input.safeParse(body);
    if (!parsed.success)
      throw new ServiceIdentityError(
        "Choose an existing user and a valid record version.",
      );
    const data = parsed.data;
    return transaction(db, () => {
      const before = db.prepare(projection + " WHERE t.id=?").get(id);
      if (!before) throw new ServiceIdentityError("Technician not found.", 404);
      if (before.version !== data.expectedVersion)
        throw new ServiceIdentityError(
          "This technician link changed. Reload and review before saving.",
          409,
        );
      if (
        data.userId &&
        (!before.active || !people().some((p) => p.id === data.userId))
      )
        throw new ServiceIdentityError(
          "Choose an active technician and an active Owner, Admin or Member account.",
        );
      if (
        data.userId &&
        db
          .prepare(
            "SELECT technician_id FROM _service_technician_users WHERE user_id=? AND technician_id<>?",
          )
          .get(data.userId, id)
      )
        throw new ServiceIdentityError(
          "That account is already linked to another technician. Unlink it there first.",
          409,
        );
      db.prepare(
        "INSERT INTO _service_technician_users(technician_id,user_id,updated_by) VALUES(?,?,?) ON CONFLICT(technician_id) DO UPDATE SET user_id=excluded.user_id,version=version+1,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP",
      ).run(id, data.userId, user.id);
      const after = db.prepare(projection + " WHERE t.id=?").get(id);
      db.prepare(
        "INSERT INTO _service_identity_audit(technician_id,actor_id,before_json,after_json) VALUES(?,?,?,?)",
      ).run(id, user.id, JSON.stringify(before), JSON.stringify(after));
      return after;
    });
  }
  function technician(user) {
    if (!writer(user)) return null;
    return (
      db
        .prepare(projection + " WHERE link.user_id=? AND t.active=1")
        .get(user.id) || null
    );
  }
  // Future PJSA/report/time services must call this inside their write transaction.
  // This guard does not retrofit the legacy company-wide job APIs into scoped APIs.
  function executionActor(user, jobId, reason = "") {
    if (!writer(user))
      throw new ServiceIdentityError(
        "Your account cannot submit job execution records.",
        403,
      );
    const job = db
      .prepare(
        "SELECT j.id,j.technician_id,t.active FROM jobs j LEFT JOIN technicians t ON t.id=j.technician_id WHERE j.id=?",
      )
      .get(jobId);
    if (!job) throw new ServiceIdentityError("Job not found.", 404);
    if (!job.technician_id || !job.active)
      throw new ServiceIdentityError(
        "Assign an active technician before recording job execution.",
        409,
      );
    const mapped = technician(user);
    if (mapped?.technician_id === job.technician_id)
      return {
        userId: user.id,
        technicianId: job.technician_id,
        delegated: false,
        reason: "",
      };
    if (
      administrator(user) &&
      typeof reason === "string" &&
      reason.trim().length >= 10 &&
      reason.length <= 1000
    )
      return {
        userId: user.id,
        technicianId: job.technician_id,
        delegated: true,
        reason: reason.trim(),
      };
    throw new ServiceIdentityError(
      "A mapped assigned technician is required. An Owner/Admin may submit on their behalf only with an explicit 10–1000 character reason.",
      403,
    );
  }
  return { configuration, save, technician, executionActor };
}
