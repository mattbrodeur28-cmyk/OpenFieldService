import type { Hono, Context } from "hono";
import type { openStorage } from "../sqlite.mjs";
export function createDispatcher(options: {
  storage: ReturnType<typeof openStorage>;
  env?: NodeJS.ProcessEnv;
  currentUser?: (c: Context) => unknown;
}): { app: Hono; timeZone: string; close(): void };
