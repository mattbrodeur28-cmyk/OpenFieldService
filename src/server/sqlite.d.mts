import type { DBEnv } from "./db.js";
import type { DatabaseSync } from "node:sqlite";

export function openStorage(filename: string): NonNullable<DBEnv["STORAGE"]> & {
  database: DatabaseSync;
  close(): void;
};
