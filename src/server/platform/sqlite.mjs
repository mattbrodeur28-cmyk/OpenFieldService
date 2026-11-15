import { createHash } from "node:crypto";

// Work must be synchronous: never hold a database transaction across an await.
export function transaction(db, work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    if (result && typeof result.then === "function")
      throw new Error(
        "Async work is not supported inside a SQLite transaction.",
      );
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function migrate(db, ledger, steps) {
  if (!/^_[a-z_]+_migrations$/.test(ledger))
    throw new Error("Invalid internal migration ledger.");
  return transaction(db, () => {
    db.exec(
      `CREATE TABLE IF NOT EXISTS ${ledger}(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    );
    const existing = db
      .prepare(`SELECT version,checksum FROM ${ledger} ORDER BY version`)
      .all();
    if (
      existing.some(
        (row) => !steps.some((step) => step.version === row.version),
      )
    )
      throw new Error("Database is newer than this application module.");
    for (const step of steps) {
      const checksum = createHash("sha256").update(step.sql).digest("hex"),
        applied = existing.find((row) => row.version === step.version);
      if (applied && applied.checksum !== checksum)
        throw new Error(
          "Applied module migration checksum changed. Restore the reviewed migration.",
        );
      if (!applied) {
        db.exec(step.sql);
        db.prepare(`INSERT INTO ${ledger}(version,checksum) VALUES(?,?)`).run(
          step.version,
          checksum,
        );
      }
    }
  });
}
