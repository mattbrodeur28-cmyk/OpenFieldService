import type { Hono, MiddlewareHandler, Context } from "hono";
export function createAuth(options: {
  filename: string;
  env?: NodeJS.ProcessEnv;
  onTechnicianUser?: (user: { id: string; name: string; email: string; role: string; active: boolean; mustChangePassword: boolean }) => void;
}): {
  app: Hono;
  guard: MiddlewareHandler;
  currentUser(c: Context): unknown;
  salesMessageReference(
    user: unknown,
    messageId: string,
  ): { teamId: string } | null;
  activeWriters(): { id: string; name: string }[];
  technicianUsers(): { id: string; name: string; email: string; role: string; active: boolean; mustChangePassword: boolean }[];
  postManagerAlert(content: string): { teamId: string; teamName: string; messageId: string; notifiedManagers: { id: string; name: string; role: string }[] } | null;
  close(): void;
};

export function passwordHash(password: string, salt?: string): Promise<string>;
