import type { Hono, Context } from "hono";
import type { openStorage } from "../sqlite.mjs";
export function createSales(options: {
  storage: ReturnType<typeof openStorage>;
  currentUser(c: Context): unknown;
  resolveMessage?(user: unknown, messageId: string): { teamId: string } | null;
  materialSnapshots?(ids: string[]): unknown[];
  jobHandoff?: ReturnType<typeof import("../service/job-handoff.mjs").createJobHandoff>;
  crmHandoff?: ReturnType<typeof import("../crm/prospect-handoff.mjs").createCrmProspectHandoff>;
  clock?(): Date;
  owners(): { id: string; name: string }[];
}): { app: Hono;issuer():{version:number;legalName:string;address:string;email:string;phone:string;terms:string}|null };
