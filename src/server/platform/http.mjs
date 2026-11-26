import { bodyLimit } from "hono/body-limit";
import { createCustomFields } from "./custom-fields.mjs";
import { PlatformDataError } from "./custom-fields-domain.mjs";
import { Hono } from 'hono';
import { z } from 'zod';
import { createModuleRegistry } from './module-registry.mjs';
import { nativeModules } from './native-modules.mjs';
export function createPlatform({ currentUser, storage }) {
    const registry = createModuleRegistry(nativeModules), app = new Hono();
    const customFields = createCustomFields({ storage, registry });
    const actor = c => { const user = currentUser(c); if (!user?.active)
        throw new PlatformDataError("Sign in to continue.", 401); if (user.mustChangePassword || !["owner", "admin"].includes(user.role))
        throw new PlatformDataError("Platform administration requires Owner or Admin access.", 403); return user; };
    app.use("*", bodyLimit({ maxSize: 50000, onError: c => c.json({ error: "Request too large." }, 413) }));
    app.onError((error, c) => { if (error instanceof PlatformDataError)
        return c.json({ error: error.message }, error.status); console.error("Platform request failed:", error.name); return c.json({ error: "The platform operation could not be completed." }, 500); });
    const body = async (c) => { try {
        return await c.req.json();
    }
    catch (e) {
        throw new PlatformDataError(e?.name === "BodyLimitError" ? "Request too large." : "Send a valid JSON request.", e?.name === "BodyLimitError" ? 413 : 400);
    } };
    app.use('*', async (c, next) => {
        c.header('Cache-Control', 'private, no-store');
        const user = currentUser(c);
        if (!user?.active)
            return c.json({ error: 'Sign in to continue.' }, 401);
        if (user.mustChangePassword)
            return c.json({ error: 'Change your temporary password before continuing.' }, 403);
        if (!['owner', 'admin'].includes(user.role))
            return c.json({ error: 'Platform metadata requires Owner or Admin access.' }, 403);
        if (!["GET", "HEAD"].includes(c.req.method) && c.req.header("X-Requested-With") !== "OpenFieldService")
            return c.json({ error: "Reload the application before changing platform data." }, 403);
        await next();
    });
    app.get('/modules', c => { const { objects, ...catalog } = registry.describe(); return c.json({ ...catalog, capabilities: { ...catalog.capabilities, customFieldRead: true, customFieldWrite: true }, customFieldObjects: customFields.objectKeys }); });
    app.get('/objects', c => {
        const result = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), search: z.string().trim().max(100).default('') }).strict().safeParse(c.req.query());
        if (!result.success)
            return c.json({ error: 'Choose a valid metadata page and search.' }, 400);
        const { page, search } = result.data, matched = registry.describe().objects.filter(o => (o.key + ' ' + o.label).toLocaleLowerCase().includes(search.toLocaleLowerCase())), start = (page - 1) * 25;
        return c.json({ contractVersion: 1, objects: matched.slice(start, start + 25), page, pageSize: 25, total: matched.length });
    });
    app.get('/objects/:key', c => { const object = registry.object(c.req.param('key')); return object ? c.json({ contractVersion: 1, object }) : c.json({ error: 'Registered object not found.' }, 404); });
    app.get('/objects/:key/fields', c => c.json(customFields.definitions(actor(c), c.req.param('key'), c.req.query())));
    app.post('/fields', async (c) => { const data = await body(c); return c.json(customFields.saveDefinition(actor(c), data)); });
    app.get('/fields/:id/history', c => c.json(customFields.fieldHistory(actor(c), c.req.param('id'), c.req.query())));
    app.get('/objects/:key/records/:id/fields', c => c.json(customFields.record(actor(c), c.req.param('key'), c.req.param('id'))));
    app.post('/objects/:key/records/:id/fields', async (c) => { const data = await body(c); return c.json(customFields.saveValues(actor(c), c.req.param('key'), c.req.param('id'), data)); });
    app.get('/objects/:key/records/:id/field-history', c => c.json(customFields.recordHistory(actor(c), c.req.param('key'), c.req.param('id'), c.req.query())));
    return { app, registry, customFields };
}
