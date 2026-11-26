import { z } from 'zod';
export class AgreementError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}
export const fail = (message, status = 400) => { throw new AgreementError(message, status); };
export const parse = (schema, raw) => {
    const result = schema.safeParse(raw);
    if (!result.success)
        fail(result.error.issues.map(i => i.message).join('; '));
    return result.data;
};
export const uuid = z.string().uuid();
const date = z.string().refine(v => v === '' || (/^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v), 'Choose a valid contract date.');
export const commandInput = z.object({ id: uuid, requestKey: uuid, expectedVersion: z.number().int().nonnegative().safe(), customerId: uuid, title: z.string().trim().min(1).max(200), scope: z.string().trim().max(12000), exclusions: z.string().trim().max(8000), terms: z.string().trim().max(12000), documentReference: z.string().trim().max(1000), startsOn: date, endsOn: date, renewalPolicy: z.enum(['manual_review', 'no_renewal']), priceCents: z.number().int().nonnegative().max(10000000000).safe().nullable(), currency: z.literal('USD'), billingFrequency: z.enum(['fixed', 'monthly', 'quarterly', 'annual']), siteIds: z.array(uuid).max(100), assetIds: z.array(uuid).max(500), archived: z.boolean(), reason: z.string().trim().min(10).max(2000) }).strict().refine(d => !d.startsOn || !d.endsOn || d.startsOn <= d.endsOn, 'End date must not precede start date.').refine(d => new Set(d.siteIds).size === d.siteIds.length && new Set(d.assetIds).size === d.assetIds.length, 'Locations and equipment must not repeat.');
export const listQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), search: z.string().trim().max(200).default(''), customerId: uuid.optional(), includeArchived: z.enum(['true', 'false']).default('false') }).strict();
export const historyQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
export function reader(user) {
    if (!user?.active || user.mustChangePassword)
        fail('Sign in to continue.', 401);
    if (!['owner', 'admin', 'member', 'viewer'].includes(user.role))
        fail('Agreement read access required.', 403);
}
export function writer(user) {
    reader(user);
    if (!['owner', 'admin'].includes(user.role))
        fail('Draft agreement administration requires Owner or Admin access.', 403);
}
export const optionsQuery = z.object({ kind: z.enum(["customer", "site", "asset"]), customerId: uuid.optional(), search: z.string().trim().max(200).default(""), page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
export const reviewInput = z.object({ id: uuid, requestKey: uuid, expectedVersion: z.number().int().positive().safe(), expectedReviewSequence: z.number().int().nonnegative().safe(), action: z.enum(["submit", "approve", "reject", "withdraw"]), reason: z.string().trim().min(10).max(2000), reviewAttested: z.literal(true) }).strict();
