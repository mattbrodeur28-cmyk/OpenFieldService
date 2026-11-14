import type { Hono } from "hono";
export function createIntegrations(options: {
  filename: string;
  env?: NodeJS.ProcessEnv;
  fetcher?: typeof fetch;
}): {
  app: Hono;
  read(user: string, provider: string, action: string): Promise<unknown>;
  close(): void;
};
