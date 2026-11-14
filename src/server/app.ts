import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from 'hono';
import { initDB } from './db.js';
import type { DBEnv } from './db.js';
export { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
export function createApp<E extends Env & { Bindings: DBEnv }>(options: { title: string; version: string; description: string }) {
  const app = new OpenAPIHono<E>({ defaultHook: (result, c) => {
    if (!result.success) return c.json({ error: result.error.issues.map(issue => issue.message).join('; ') }, 400);
  } });
  app.use('*', async (c, next) => { initDB(c.env); await next(); });
  app.doc('/api/openapi.json', { openapi: '3.0.0', info: options });
  app.get('/llms.txt', c => c.text(`${options.title}\n${options.description}\nAPI schema: /api/openapi.json\n`));
  return app;
}
