import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Implements @clawnify/db's STORAGE contract; Wrangler keeps its D1 binding.
export function openStorage(filename) {
  if (filename !== ":memory:") mkdirSync(dirname(resolve(filename)), { recursive: true });
  const database = new DatabaseSync(filename);
  try {
    database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
    const existing = database.prepare("PRAGMA table_info(customers)").all();
    if (existing.length && existing.find((column) => column.name === "id")?.type !== "TEXT") {
      throw new Error("Legacy integer-ID database: back up and migrate with the existing UUID migration tools before starting. No schema changes were applied.");
    }
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    database.close();
    throw error;
  }
  return {
    database,
    async query(sql, params = []) {
      const statement = database.prepare(sql);
      if (statement.columns().length) return { rows: statement.all(...params) };
      const result = statement.run(...params);
      return { rows: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
    },
    close() { database.close(); },
  };
}
