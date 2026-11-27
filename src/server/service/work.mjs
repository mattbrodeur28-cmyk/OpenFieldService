import { migrate } from "../platform/sqlite.mjs";
export const workCategories = ["unspecified", "on_demand", "quoted", "pm"];
const schema = `CREATE TABLE _service_work(job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,category TEXT NOT NULL CHECK(category IN ('unspecified','on_demand','quoted','pm')),updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);CREATE TABLE _service_work_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT NOT NULL,actor_id TEXT NOT NULL,before_category TEXT NOT NULL,after_category TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`;
export function installServiceWork(db) {
  migrate(db, "_service_work_migrations", [{ version: 1, sql: schema }]);
}
// Caller owns a synchronous service-database transaction. This is the authoritative
// classification; Dispatcher state is maintained as a derived compatibility projection.
export function setWorkCategory(db, user, jobId, category) {
  if (
    !user?.active ||
    user.mustChangePassword ||
    !["owner", "admin", "member", "technician"].includes(user.role)
  )
    throw new Error("WORK_CATEGORY_FORBIDDEN");
  if (!workCategories.includes(category))
    throw new Error("WORK_CATEGORY_INVALID");
  const before =
    db.prepare("SELECT category FROM _service_work WHERE job_id=?").get(jobId)
      ?.category || "unspecified";
  if (before === category) return;
  db.prepare(
    "INSERT INTO _service_work(job_id,category,updated_by) VALUES(?,?,?) ON CONFLICT(job_id) DO UPDATE SET category=excluded.category,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP",
  ).run(jobId, category, user.id);
  db.prepare(
    "INSERT INTO _service_work_audit(job_id,actor_id,before_category,after_category) VALUES(?,?,?,?)",
  ).run(jobId, user.id, before, category);
}
