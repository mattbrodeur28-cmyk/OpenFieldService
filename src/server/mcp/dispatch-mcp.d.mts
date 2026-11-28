import type { Hono, Context } from "hono";
export function createDispatchMcp(options: {
  storage: { database: unknown };
  currentUser?: (c: Context) => unknown;
  postManagerAlert?: (content: string) => { teamId: string; teamName: string; messageId: string; notifiedManagers: { id: string; name: string; role: string }[] } | null;
  env?: NodeJS.ProcessEnv;
}): {
  mcpApp: Hono;
  adminApp: Hono;
  tools: unknown[];
};
