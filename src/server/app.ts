import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from 'hono';
import { initDB } from './db.js';
import type { DBEnv } from './db.js';
export { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
export function createApp<E extends Env & { Bindings: DBEnv }>(options: { title: string; version: string; description: string }) {
  const app = new OpenAPIHono<E>({ defaultHook: (result, c) => {
    if (!result.success) return c.json({ error: result.error.issues.map(issue => issue.message).join('; ') }, 400);
  } });
  app.onError((error, c) => {
    const conflicts: Record<string, string> = {
      DISPATCH_SERVICE_HOURS: 'Outside company service hours. Schedule within service hours or use an approved emergency assignment in Dispatcher.',
      DISPATCH_OVERLAP: 'This technician already has overlapping work.',
      DISPATCH_AVAILABILITY: 'This assignment is outside declared availability.',
      DISPATCH_CLOSED: 'Completed or cancelled jobs cannot be rescheduled.',
      DISPATCH_INACTIVE: 'Choose an active technician.',
      DISPATCH_INVALID: 'Choose a valid interval within one calendar day.',
    };
    const conflict = Object.entries(conflicts).find(([code]) => error.message.includes(code));
    if (error.message.includes('FOREIGN KEY constraint failed')) return c.json({ error: 'This record is linked to other business records. Remove or reassign those links first.' }, 409);
    if (conflict) return c.json({ error: conflict[1] }, 409);
    if ('getResponse' in error && typeof error.getResponse === 'function') return error.getResponse();
    console.error('Service request failed:', error.name);
    return c.json({ error: 'The service operation could not be completed.' }, 500);
  });
  app.use('*', async (c, next) => { initDB(c.env); await next(); });
  app.doc('/api/openapi.json', { openapi: '3.0.0', info: options });
  app.get('/llms.txt', c => c.text(`${options.title}\n${options.description}\nAPI schema: /api/openapi.json\n`));
  return app;
}
