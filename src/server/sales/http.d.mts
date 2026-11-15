import type { Hono, Context } from "hono";
import type { openStorage } from "../sqlite.mjs";
export function createSales(options: {
  storage: ReturnType<typeof openStorage>;
  currentUser(c: Context): unknown;
  owners(): { id: string; name: string }[];
}): { app: Hono };
