import { z } from 'zod';
export class HrError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}
export const fail = (message, status = 400) => { throw new HrError(message, status); };
export function peopleManager(user) { if (!user?.active)
    fail('Sign in to continue.', 401); if (user.mustChangePassword || !(['owner', 'admin'].includes(user.role) || (user.role === 'member' && user.hr === true)))
    fail('People administration access required.', 403); }
export function parse(schema, raw) { const r = schema.safeParse(raw); if (!r.success)
    fail(r.error.issues.map(i => i.message).join('; ')); return r.data; }
export const uuid = z.string().uuid();
const date = z.string().refine(v => v === '' || (/^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v), 'Choose a valid employment start date.');
export const staffCommand = z.object({ id: uuid, requestKey: uuid, expectedVersion: z.number().int().nonnegative().safe(), name: z.string().trim().min(1).max(200), email: z.union([z.literal(''), z.string().trim().email().max(254)]), phone: z.string().trim().max(60), title: z.string().trim().max(200), employmentStatus: z.enum(['active', 'on_leave', 'inactive', 'terminated']), startDate: date, supervisorId: uuid.nullable(), technician: z.boolean(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), reason: z.string().trim().min(10).max(2000), acknowledgeOpenWork: z.boolean().default(false) }).strict();
export const listQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), search: z.string().trim().max(200).default(''), status: z.enum(['all', 'active', 'on_leave', 'inactive', 'terminated']).default('all') }).strict();
export const optionsQuery = z.object({ search: z.string().trim().max(200).default('') }).strict();
export const historyQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
