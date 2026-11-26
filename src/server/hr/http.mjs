import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createStaff } from './service.mjs';
import { HrError, peopleManager } from './domain.mjs';
export function createHr({ storage, currentUser }) {
    const staff = createStaff({ storage }), app = new Hono();
    const check = c => { const user = currentUser(c); peopleManager(user); if (!['GET', 'HEAD'].includes(c.req.method) && c.req.header('X-Requested-With') !== 'OpenFieldService')
        throw new HrError('Use the workspace application to change staff.', 403); return user; };
    app.use('*', bodyLimit({ maxSize: 50000, onError: c => c.json({ error: 'Request too large.' }, 413) }));
    app.use('*', (c, next) => { c.header('Cache-Control', 'private, no-store'); check(c); return next(); });
    app.onError((error, c) => { if (error instanceof HrError)
        return c.json({ error: error.message }, error.status); console.error('HR request failed:', error.name); return c.json({ error: 'The HR operation could not be completed.' }, 500); });
    app.get('/staff', c => c.json(staff.list(check(c), c.req.query())));
    app.get('/staff/options', c => c.json(staff.options(check(c), c.req.query())));
    app.get('/staff/:id', c => c.json(staff.detail(check(c), c.req.param('id'))));
    app.get('/staff/:id/history', c => c.json(staff.history(check(c), c.req.param('id'), c.req.query())));
    app.post('/staff', async (c) => { let input; try {
        input = await c.req.json();
    }
    catch (e) {
        throw new HrError(e?.name === 'BodyLimitError' ? 'Request too large.' : 'Send valid JSON.', e?.name === 'BodyLimitError' ? 413 : 400);
    } return c.json(staff.save(check(c), input)); });
    return { app, staff };
}
