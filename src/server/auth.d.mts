import type { Hono, MiddlewareHandler, Context } from 'hono';
export function createAuth(options: { filename: string; env?: NodeJS.ProcessEnv }): { app: Hono; guard: MiddlewareHandler; currentUser(c: Context): unknown; close(): void };

export function passwordHash(password: string, salt?: string): Promise<string>;
