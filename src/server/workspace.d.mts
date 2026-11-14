import type { Hono, Context } from 'hono';
import type { DBEnv } from './db.js';
export function createWorkspace(options: { filename: string; storage: NonNullable<DBEnv['STORAGE']>; root: string; env?: NodeJS.ProcessEnv; fetcher?: typeof fetch; integrationRead?: (user: string, provider: string, action: string) => Promise<unknown> }): { app: Hono; publicCompany(c: Context): Response | Promise<Response>; close(): void };
