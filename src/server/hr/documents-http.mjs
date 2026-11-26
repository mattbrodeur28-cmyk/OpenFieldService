import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createPersonnelDocuments, MAX_DOCUMENT_BYTES } from './documents.mjs';
import { HrError, peopleManager } from './domain.mjs';
export function createHrDocuments({ storage, currentUser }) {
    const documents = createPersonnelDocuments({ storage }), app = new Hono();
    const actor = c => { const user = currentUser(c); peopleManager(user); if (!['GET', 'HEAD'].includes(c.req.method) && c.req.header('X-Requested-With') !== 'OpenFieldService')
        throw new HrError('Use the workspace application to change personnel documents.', 403); return user; };
    app.use('*', (c, next) => { c.header('Cache-Control', 'private, no-store'); actor(c); return next(); });
    const uploadLimit = bodyLimit({ maxSize: MAX_DOCUMENT_BYTES + 65536, onError: c => c.json({ error: 'Choose a file up to 10 MiB.' }, 413) }), jsonLimit = bodyLimit({ maxSize: 50000, onError: c => c.json({ error: 'Request too large.' }, 413) });
    app.use('*', (c, next) => (c.req.path.endsWith('/upload') ? uploadLimit : jsonLimit)(c, next));
    app.onError((error, c) => { if (error instanceof HrError)
        return c.json({ error: error.message }, error.status); if (error?.name === 'BodyLimitError')
        return c.json({ error: 'Request too large.' }, 413); console.error('Personnel document request failed:', error.name); return c.json({ error: 'The personnel document operation could not be completed.' }, 500); });
    app.get('/staff/:id', c => c.json(documents.list(actor(c), c.req.param('id'), c.req.query())));
    app.post('/staff/:id/upload', async (c) => {
        let form;
        try {
            form = await c.req.raw.formData();
        }
        catch (error) {
            if (error?.name === 'BodyLimitError')
                throw error;
            throw new HrError('Send a multipart file upload.');
        }
        if ([...form.keys()].some(k => !['file', 'metadata'].includes(k)) || form.getAll('file').length !== 1 || form.getAll('metadata').length !== 1)
            throw new HrError('Upload exactly one file and its metadata.');
        const file = form.get('file');
        if (!(file instanceof File) || file.size === 0 || file.size > MAX_DOCUMENT_BYTES)
            throw new HrError('Choose a nonempty supported file up to 10 MiB.', 413);
        let metadata;
        try {
            metadata = JSON.parse(String(form.get('metadata')));
        }
        catch {
            throw new HrError('Send valid personnel document metadata.');
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        return c.json(documents.upload(actor(c), c.req.param('id'), metadata, bytes, file.name));
    });
    app.post('/records/:id', async (c) => { let data; try {
        data = await c.req.json();
    }
    catch (error) {
        if (error?.name === 'BodyLimitError')
            throw error;
        throw new HrError('Send valid JSON.');
    } return c.json(documents.edit(actor(c), c.req.param('id'), data)); });
    app.get('/records/:id/history', c => c.json(documents.history(actor(c), c.req.param('id'), c.req.query())));
    app.get('/records/:id/download', c => { const { metadata, bytes } = documents.download(actor(c), c.req.param('id')), suffix = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[metadata.mediaType], name = encodeURIComponent(metadata.originalName.replace(/\.[^.]*$/, '') + '.' + suffix).replace(/[!'()*]/g, ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase()); return new Response(bytes, { headers: { 'Content-Type': metadata.mediaType, 'Content-Length': String(bytes.length), 'Content-Disposition': `attachment; filename="personnel-document.${suffix}"; filename*=UTF-8''${name}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'", 'Cross-Origin-Resource-Policy': 'same-origin' } }); });
    return { app, documents };
}
