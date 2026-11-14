import { DatabaseSync, backup } from "node:sqlite";
import { resolve } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const source = resolve(process.env.DATABASE_PATH ?? "data/openfieldservice.sqlite");
const destination = process.argv[2];
if (!destination) throw new Error("Usage: pnpm db:backup /path/to/new-backup.sqlite");
if (!existsSync(source)) throw new Error("Database does not exist: " + source);
const target = resolve(destination);
if (existsSync(target)) throw new Error("Backup destination already exists; choose a new filename");
mkdirSync(dirname(target), { recursive: true });
const database = new DatabaseSync(source, { readOnly: true });
try {
  await backup(database, target);
  console.log("Database backup saved to " + target);
} finally { database.close(); }
