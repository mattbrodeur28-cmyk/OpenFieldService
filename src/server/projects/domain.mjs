import { z } from "zod";

export class ProjectError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}
export const fail = (message, status = 400) => { throw new ProjectError(message, status); };
export const parse = (schema, raw) => {
    const result = schema.safeParse(raw);
    if (!result.success) fail(result.error.issues.map((i) => i.message).join("; "));
    return result.data;
};
export const uuid = z.string().uuid();
const date = z.string().refine((v) => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v))), "Choose a valid date.");
export function writer(user) {
    if (!user?.active || user.mustChangePassword) fail("Sign in to continue.", 401);
    if (!["owner", "admin", "member"].includes(user.role)) fail("Your account cannot change projects.", 403);
}
export function reader(user) {
    if (!user?.active || user.mustChangePassword) fail("Sign in to continue.", 401);
}

export const projectInput = z.object({
    id: uuid, requestKey: uuid, expectedVersion: z.number().int().nonnegative().safe(),
    customerId: uuid, title: z.string().trim().min(1).max(200), description: z.string().trim().max(8000).default(""),
    status: z.enum(["draft", "active", "on_hold", "completed", "closed"]).default("active"),
    projectManager: z.string().trim().max(100).default(""),
    plannedStart: date.default(""), plannedEnd: date.default(""), actualStart: date.default(""), actualEnd: date.default(""),
    sourceKind: z.string().trim().max(40).nullable().default(null), sourceId: uuid.nullable().default(null),
    archived: z.boolean().default(false),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const phaseInput = z.object({
    id: uuid, requestKey: uuid, expectedVersion: z.number().int().nonnegative().safe(),
    name: z.string().trim().min(1).max(200), costCode: z.string().trim().max(60).default(""), owner: z.string().trim().max(100).default(""),
    plannedStart: date.default(""), plannedEnd: date.default(""), actualStart: date.default(""), actualEnd: date.default(""),
    position: z.number().int().nonnegative().safe().default(0),
    percentComplete: z.number().int().min(0).max(100).default(0),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const milestoneInput = z.object({
    id: uuid, requestKey: uuid, name: z.string().trim().min(1).max(200),
    dueDate: date.default(""), completed: z.boolean().default(false),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const linkJobInput = z.object({
    id: uuid, requestKey: uuid, jobId: uuid, phaseId: uuid.nullable().default(null),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const linkSiteInput = z.object({
    id: uuid, requestKey: uuid, siteId: uuid,
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const deliverableInput = z.object({
    id: uuid, requestKey: uuid, name: z.string().trim().min(1).max(200),
    dueDate: date.default(""), completed: z.boolean().default(false),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const fromProposalInput = z.object({
    projectId: uuid, requestKey: uuid, quoteId: uuid,
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const baselineInput = z.object({
    requestKey: uuid,
    baselineCostCents: z.number().int().nonnegative().nullable(),
    baselineStart: date.default(""), baselineEnd: date.default(""),
    estimateToCompleteCents: z.number().int().nonnegative().nullable(),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const issueInput = z.object({
    id: uuid, requestKey: uuid,
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).default(""),
    severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    status: z.enum(["open", "in_progress", "blocked", "resolved"]).default("open"),
    assignedTo: z.string().trim().max(100).default(""),
    dueDate: date.default(""),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const dependencyInput = z.object({
    id: uuid, requestKey: uuid,
    phaseId: uuid, dependsOnId: uuid,
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();
