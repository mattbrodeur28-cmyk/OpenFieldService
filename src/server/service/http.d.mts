import type { Hono, Context } from "hono";
import type { openStorage } from "../sqlite.mjs";
export function createService(options: {
  storage: ReturnType<typeof openStorage>;
  currentUser(c: Context): unknown;
  people(): { id: string; name: string }[];
}): { app: Hono; documents: { app: Hono } };
