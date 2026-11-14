import type { Hono, Context } from 'hono';
import type { DBEnv } from './db.js';
export function createWorkspace(options: { filename: string; storage: NonNullable<DBEnv['STORAGE']>; root: string; env?: NodeJS.ProcessEnv; fetcher?: typeof fetch }): { app: Hono; publicCompany(c: Context): Response | Promise<Response>; close(): void };
