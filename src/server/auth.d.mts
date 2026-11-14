import type { Hono, MiddlewareHandler } from 'hono';
export function createAuth(options: { filename: string; env?: NodeJS.ProcessEnv }): { app: Hono; guard: MiddlewareHandler; close(): void };

export function passwordHash(password: string, salt?: string): Promise<string>;
