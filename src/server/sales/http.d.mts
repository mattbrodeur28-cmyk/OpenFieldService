import type { Hono, Context } from "hono";
import type { openStorage } from "../sqlite.mjs";
export function createSales(options: {
  storage: ReturnType<typeof openStorage>;
  currentUser(c: Context): unknown;
  resolveMessage?(user: unknown, messageId: string): { teamId: string } | null;
  materialSnapshots?(ids: string[]): unknown[];
  owners(): { id: string; name: string }[];
}): { app: Hono };
