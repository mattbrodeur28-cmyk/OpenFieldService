import type { Hono } from 'hono';
import type { DBEnv } from '@clawnify/db';
export function createWorkspace(options: { filename: string; storage: NonNullable<DBEnv['STORAGE']>; root: string; env?: NodeJS.ProcessEnv; fetcher?: typeof fetch }): { app: Hono; close(): void };
