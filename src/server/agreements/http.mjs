import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createAgreements } from './service.mjs';
import { AgreementError, reader } from './domain.mjs';
export function createAgreementModule({ storage, currentUser }) {
    const agreements = createAgreements({ storage }), app = new Hono();
    const actor = c => {
        const user = currentUser(c);
        reader(user);
        if (!['GET', 'HEAD'].includes(c.req.method) && c.req.header('X-Requested-With') !== 'OpenFieldService')
            throw new AgreementError('Use the workspace application to change agreements.', 403);
        return user;
    };
    app.use('*', (c, next) => { c.header('Cache-Control', 'private, no-store'); actor(c); return next(); });
    app.use('*', bodyLimit({ maxSize: 100000, onError: c => c.json({ error: 'Agreement request too large.' }, 413) }));
    app.onError((error, c) => {
        if (error instanceof AgreementError)
            return c.json({ error: error.message }, error.status);
        console.error('Agreement request failed:', error.name);
        return c.json({ error: 'The agreement operation could not be completed.' }, 500);
    });
    app.get('/', c => c.json(agreements.list(actor(c), c.req.query())));
    app.get('/options', c => c.json(agreements.options(actor(c), c.req.query())));
    app.get('/:id/review-history', c => c.json(agreements.reviewHistory(actor(c), c.req.param('id'), c.req.query())));
    app.post('/:id/review', async (c) => { let data; try {
        data = await c.req.json();
    }
    catch (error) {
        throw new AgreementError(error?.name === 'BodyLimitError' ? 'Agreement request too large.' : 'Send valid review JSON.', error?.name === 'BodyLimitError' ? 413 : 400);
    } return c.json(agreements.review(actor(c), c.req.param('id'), data)); });
    app.get('/:id/history', c => c.json(agreements.history(actor(c), c.req.param('id'), c.req.query())));
    app.get('/:id', c => c.json(agreements.detail(actor(c), c.req.param('id'))));
    app.post('/', async (c) => {
        let data;
        try {
            data = await c.req.json();
        }
        catch (error) {
            throw new AgreementError(error?.name === 'BodyLimitError' ? 'Agreement request too large.' : 'Send valid agreement JSON.', error?.name === 'BodyLimitError' ? 413 : 400);
        }
        return c.json(agreements.save(actor(c), data));
    });
    return { app, agreements };
}
