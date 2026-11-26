import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createAgreements } from './service.mjs';
import { AgreementError, reader } from './domain.mjs';
export function createAgreementModule({ storage, currentUser, issuer, timeZone, clock, maintenanceJobs }) {
    const agreements = createAgreements({ storage, issuer, timeZone, clock, maintenanceJobs }), app = new Hono();
    const actor = c => {
        const user = currentUser(c);
        reader(user);
        if (!['GET', 'HEAD'].includes(c.req.method) && c.req.header('X-Requested-With') !== 'OpenFieldService')
            throw new AgreementError('Use the workspace application to change agreements.', 403);
        return user;
    };
    app.use('*', (c, next) => { c.header('Cache-Control', 'private, no-store'); actor(c); return next(); });
    const jsonLimit = bodyLimit({ maxSize: 100000, onError: c => c.json({ error: 'Agreement request too large.' }, 413) }), uploadLimit = bodyLimit({ maxSize: 10 * 1024 * 1024 + 65536, onError: c => c.json({ error: 'Choose a PDF up to 10 MiB.' }, 413) });
    app.use('*', (c, next) => (c.req.path.endsWith('/proposed-document/upload') ? uploadLimit : jsonLimit)(c, next));
    app.onError((error, c) => {
        if (error instanceof AgreementError)
            return c.json({ error: error.message }, error.status);
        console.error('Agreement request failed:', error.name);
        return c.json({ error: 'The agreement operation could not be completed.' }, 500);
    });
    app.get('/', c => c.json(agreements.list(actor(c), c.req.query())));
    app.get('/options', c => c.json(agreements.options(actor(c), c.req.query())));
    app.get('/:id/proposed-document', c => c.json(agreements.proposedDocument(actor(c), c.req.param('id'), c.req.query())));
    app.post('/:id/proposed-document/upload', async (c) => {
        let form;
        try {
            form = await c.req.raw.formData();
        }
        catch (error) {
            throw new AgreementError(error?.name === 'BodyLimitError' ? 'Choose a PDF up to 10 MiB.' : 'Send a multipart PDF upload.', error?.name === 'BodyLimitError' ? 413 : 400);
        }
        if ([...form.keys()].some(k => !['file', 'metadata'].includes(k)) || form.getAll('file').length !== 1 || form.getAll('metadata').length !== 1)
            throw new AgreementError('Upload exactly one PDF and its metadata.');
        const file = form.get('file');
        if (!(file instanceof File) || file.size === 0 || file.size > 10 * 1024 * 1024)
            throw new AgreementError('Choose a nonempty PDF up to 10 MiB.', 413);
        let metadata;
        try {
            metadata = JSON.parse(String(form.get('metadata')));
        }
        catch {
            throw new AgreementError('Send valid upload metadata.');
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        return c.json(agreements.uploadDocument(actor(c), c.req.param('id'), metadata, bytes, file.name));
    });
    app.get('/documents/:documentId/download', c => { const { document, bytes } = agreements.downloadDocument(actor(c), c.req.param('documentId')), name = encodeURIComponent(document.originalName.replace(/\.[^.]*$/, '') + '.pdf').replace(/[!'()*]/g, ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase()); return new Response(bytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(bytes.length), 'Content-Disposition': `attachment; filename="proposed-contract.pdf"; filename*=UTF-8''${name}`, 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "sandbox; default-src 'none'", 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' } }); });
    app.get('/:id/activation', c => c.json(agreements.activation.summary(actor(c), c.req.param('id'))));
    app.get('/:id/coverage', c => c.json(agreements.activation.coverage(actor(c), c.req.param('id'), c.req.query())));
    app.get('/:id/entitlement', c => c.json(agreements.activation.entitlement(actor(c), c.req.param('id'))));
    app.get('/:id/profitability', c => c.json(agreements.activation.profitability(actor(c), c.req.param('id'))));
    app.get('/:id/renewals', c => c.json(agreements.renewal.history(actor(c), c.req.param('id'))));
    app.get('/:id/amendments', c => c.json(agreements.amendment.history(actor(c), c.req.param('id'))));
    app.get('/:id/authoritative-document', c => c.json({ document: agreements.authoritative.detail(actor(c), c.req.param('id')) }));
    app.post('/:id/authoritative-document', async (c) => {
        let data;
        try {
            data = await c.req.json();
        }
        catch (error) {
            throw new AgreementError(error?.name === 'BodyLimitError' ? 'Agreement request too large.' : 'Send valid authoritative-document JSON.', error?.name === 'BodyLimitError' ? 413 : 400);
        }
        return c.json(agreements.authoritative.authorize(actor(c), c.req.param('id'), data));
    });
    app.post('/:id/amendment', async (c) => {
        let data;
        try {
            data = await c.req.json();
        }
        catch (error) {
            throw new AgreementError(error?.name === 'BodyLimitError' ? 'Agreement request too large.' : 'Send valid amendment JSON.', error?.name === 'BodyLimitError' ? 413 : 400);
        }
        return c.json(agreements.amendment.amend(actor(c), c.req.param('id'), data));
    });
    app.post('/:id/renewal', async (c) => {
        let data;
        try {
            data = await c.req.json();
        }
        catch (error) {
            throw new AgreementError(error?.name === 'BodyLimitError' ? 'Agreement request too large.' : 'Send valid renewal JSON.', error?.name === 'BodyLimitError' ? 413 : 400);
        }
        return c.json(agreements.renewal.renew(actor(c), c.req.param('id'), data));
    });
    for (const [suffix, method] of [['authorize', 'authorize'], ['cancel', 'cancel']])
        app.post('/:id/activation/' + suffix, async (c) => {
            let data;
            try {
                data = await c.req.json();
            }
            catch (error) {
                throw new AgreementError(error?.name === 'BodyLimitError' ? 'Agreement request too large.' : 'Send valid authorization JSON.', error?.name === 'BodyLimitError' ? 413 : 400);
            }
            return c.json(agreements.activation[method](actor(c), c.req.param('id'), data));
        });
    app.get('/:id/maintenance/plans', c => c.json(agreements.maintenance.plans(actor(c), c.req.param('id'))));
    app.get('/:id/maintenance/plans/:planId', c => c.json(agreements.maintenance.detail(actor(c), c.req.param('id'), c.req.param('planId'))));
    app.get('/:id/maintenance/plans/:planId/history', c => c.json(agreements.maintenance.history(actor(c), c.req.param('id'), c.req.param('planId'))));
    app.get('/:id/maintenance/preview', c => c.json(agreements.maintenance.preview(actor(c), c.req.param('id'), c.req.query())));
    for (const [suffix, method] of [['plans', 'save'], ['generate', 'generate'], ['skip', 'skip']])
        app.post('/:id/maintenance/' + suffix, async (c) => {
            let data;
            try {
                data = await c.req.json();
            }
            catch (error) {
                throw new AgreementError(error?.name === 'BodyLimitError' ? 'Agreement request too large.' : 'Send valid maintenance JSON.', error?.name === 'BodyLimitError' ? 413 : 400);
            }
            return c.json(agreements.maintenance[method](actor(c), c.req.param('id'), data));
        });
    app.get('/:id/lifecycle', c => c.json(agreements.lifecycle.summary(actor(c), c.req.param('id'))));
    app.get('/:id/lifecycle/history', c => c.json(agreements.lifecycle.history(actor(c), c.req.param('id'), c.req.query())));
    for (const [suffix, method] of [['offer', 'offer'], ['response', 'record']])
        app.post('/:id/lifecycle/' + suffix, async (c) => {
            let data;
            try {
                data = await c.req.json();
            }
            catch (error) {
                throw new AgreementError(error?.name === 'BodyLimitError' ? 'Agreement request too large.' : 'Send valid lifecycle JSON.', error?.name === 'BodyLimitError' ? 413 : 400);
            }
            return c.json(agreements.lifecycle[method](actor(c), c.req.param('id'), data));
        });
    app.get('/:id/review-history', c => c.json(agreements.reviewHistory(actor(c), c.req.param('id'), c.req.query())));
    app.post('/:id/review', async (c) => {
        let data;
        try {
            data = await c.req.json();
        }
        catch (error) {
            throw new AgreementError(error?.name === 'BodyLimitError' ? 'Agreement request too large.' : 'Send valid review JSON.', error?.name === 'BodyLimitError' ? 413 : 400);
        }
        return c.json(agreements.review(actor(c), c.req.param('id'), data));
    });
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
