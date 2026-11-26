import { z } from 'zod';
export class PlatformDataError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}
export function fail(message, status = 400) { throw new PlatformDataError(message, status); }
export function parse(schema, raw) { const result = schema.safeParse(raw); if (!result.success)
    fail(result.error.issues.map(i => i.message).join('; ')); return result.data; }
export const uuid = z.string().uuid(), version = z.number().int().nonnegative().safe();
export const objectKey = z.enum(['crm.customer', 'equipment.asset', 'sales.opportunity', 'service.job']);
const option = z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), label: z.string().trim().min(1).max(100), active: z.boolean() }).strict();
export const fieldCommand = z.object({ id: uuid, requestKey: uuid, expectedVersion: version, objectKey, key: z.string().regex(/^custom_[a-z][a-z0-9_]{0,42}$/), label: z.string().trim().min(1).max(100), description: z.string().trim().max(1000), type: z.enum(['text', 'integer', 'boolean', 'date', 'select']), options: z.array(option).max(50), active: z.boolean(), reason: z.string().trim().min(10).max(2000) }).strict();
export const valueCommand = z.object({ id: uuid, requestKey: uuid, expectedVersion: version, changes: z.array(z.object({ fieldId: uuid, fieldVersion: version, value: z.unknown() }).strict()).min(1).max(100), reason: z.string().trim().min(10).max(2000) }).strict();
export const pageQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
export const fieldQuery = z.object({ includeArchived: z.enum(['true', 'false']).default('false') }).strict();
export function validateDefinition(d, old) {
    if (d.type !== 'select' && d.options.length)
        fail('Only selection fields have options.');
    if (d.type === 'select' && !d.options.some(o => o.active))
        fail('A selection field needs at least one active option.');
    if (new Set(d.options.map(o => o.key)).size !== d.options.length || new Set(d.options.map(o => o.label.toLocaleLowerCase())).size !== d.options.length)
        fail('Choice keys and labels must be unique.');
    if (old) {
        if (old.objectKey !== d.objectKey || old.key !== d.key || old.type !== d.type)
            fail('Field identity, object, key and type are immutable. Create a new reviewed field for a type change.', 409);
        for (const option of old.options)
            if (!d.options.some(o => o.key === option.key))
                fail('Retain existing choices; mark a choice inactive instead of removing it.', 409);
    }
}
export function validateValue(field, value) {
    if (value === null)
        return null;
    if (field.type === 'text')
        return parse(z.string().max(2000), value);
    if (field.type === 'integer')
        return parse(z.number().int().safe(), value);
    if (field.type === 'boolean')
        return parse(z.boolean(), value);
    if (field.type === 'date')
        return parse(z.string().refine(v => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Choose a valid calendar date.'), value);
    if (field.type === 'select' && typeof value === 'string' && field.options.some(o => o.active && o.key === value))
        return value;
    fail('Choose a current option for ' + field.label + '.');
}
export function administrator(user) {
    if (!user?.active)
        fail('Sign in to continue.', 401);
    if (user.mustChangePassword || !['owner', 'admin'].includes(user.role))
        fail('Custom fields currently require Owner or Admin access.', 403);
}
