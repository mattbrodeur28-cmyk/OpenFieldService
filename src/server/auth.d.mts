import type { Hono, MiddlewareHandler, Context } from "hono";
export function createAuth(options: {
  filename: string;
  env?: NodeJS.ProcessEnv;
}): {
  app: Hono;
  guard: MiddlewareHandler;
  currentUser(c: Context): unknown;
  salesMessageReference(
    user: unknown,
    messageId: string,
  ): { teamId: string } | null;
  activeWriters(): { id: string; name: string }[];
  close(): void;
};

export function passwordHash(password: string, salt?: string): Promise<string>;
