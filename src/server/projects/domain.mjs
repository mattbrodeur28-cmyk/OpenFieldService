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
export function approver(user) {
    if (!user?.active || user.mustChangePassword) fail("Sign in to continue.", 401);
    if (!["owner", "admin"].includes(user.role)) fail("Owner or Admin approval is required for this project action.", 403);
}
export function reader(user) {
    if (!user?.active || user.mustChangePassword) fail("Sign in to continue.", 401);
}

export const projectInput = z.object({
    id: uuid, requestKey: uuid, expectedVersion: z.number().int().nonnegative().safe(),
    customerId: uuid, title: z.string().trim().min(1).max(200), description: z.string().trim().max(8000).default(""),
    status: z.enum(["draft", "active", "on_hold", "completed", "closed"]).default("active"),
    track: z.enum(["commercial", "construction", "service"]).default("commercial"),
    contractValueCents: z.number().int().nonnegative().max(100000000000).default(0),
    retainageBps: z.number().int().min(0).max(5000).default(1000),
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

export const costSectionInput = z.object({
    id: uuid, requestKey: uuid,
    name: z.string().trim().min(1).max(80),
    position: z.number().int().nonnegative().default(0),
    quantityMilli: z.number().int().nonnegative().max(1000000000).default(0),
    costRateCents: z.number().int().nonnegative().max(100000000).default(0),
    billRateCents: z.number().int().nonnegative().max(100000000).default(0),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const fieldDocInput = z.object({
    id: uuid, requestKey: uuid, expectedVersion: z.number().int().nonnegative().safe().default(0),
    phaseId: uuid.nullable().default(null),
    jobId: uuid.nullable().default(null),
    docType: z.enum(["daily_log", "photo", "form", "signature", "completion_evidence", "attachment"]),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().max(12000).default(""),
    documentId: uuid.nullable().default(null),
    billingRequired: z.boolean().default(false),
    status: z.enum(["draft", "submitted", "approved", "rejected"]).default("submitted"),
    signatureName: z.string().trim().max(120).default(""),
    signatureIntent: z.string().trim().max(500).default(""),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const crewInput = z.object({
    id: uuid, requestKey: uuid, expectedVersion: z.number().int().nonnegative().safe().default(0),
    name: z.string().trim().min(1).max(120),
    leadTechnicianId: uuid.nullable().default(null),
    costCode: z.string().trim().max(60).default(""),
    active: z.boolean().default(true),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const crewMemberInput = z.object({
    id: uuid, requestKey: uuid,
    technicianId: uuid,
    role: z.string().trim().min(1).max(60).default("technician"),
    effectiveFrom: date.refine((v) => v !== "", "Choose an effective start date."),
    effectiveTo: date.default(""),
    hourlyCostCents: z.number().int().nonnegative().max(10000000).default(0),
    hourlyBillCents: z.number().int().nonnegative().max(10000000).default(0),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const crewTimeInput = z.object({
    id: uuid, requestKey: uuid,
    crewId: uuid.nullable().default(null),
    technicianId: uuid,
    jobId: uuid.nullable().default(null),
    phaseId: uuid.nullable().default(null),
    costCode: z.string().trim().max(60).default(""),
    workDate: date.refine((v) => v !== "", "Choose a work date."),
    hoursMilli: z.number().int().min(1).max(24000),
    hourlyCostCents: z.number().int().nonnegative().max(10000000).default(0),
    notes: z.string().trim().max(2000).default(""),
    correctionOf: uuid.nullable().default(null),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const reviewDecisionInput = z.object({
    requestKey: uuid,
    decision: z.enum(["approved", "rejected"]),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const changeOrderInput = z.object({
    id: uuid, requestKey: uuid, expectedVersion: z.number().int().nonnegative().safe().default(0),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(8000).default(""),
    phaseId: uuid.nullable().default(null),
    costCode: z.string().trim().max(60).default(""),
    laborCostCents: z.number().int().min(-10000000000).max(10000000000).default(0),
    materialCostCents: z.number().int().min(-10000000000).max(10000000000).default(0),
    subcontractCostCents: z.number().int().min(-10000000000).max(10000000000).default(0),
    priceCents: z.number().int().min(-10000000000).max(10000000000).default(0),
    scheduleImpactDays: z.number().int().min(-3650).max(3650).default(0),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const changeOrderActionInput = z.object({
    requestKey: uuid,
    expectedVersion: z.number().int().positive().safe(),
    action: z.enum(["submit", "approve", "reject", "customer_accept"]),
    customerAcceptedBy: z.string().trim().max(120).default(""),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const purchasingLinkInput = z.object({
    id: uuid, requestKey: uuid,
    phaseId: uuid.nullable().default(null),
    costCode: z.string().trim().max(60).default(""),
    orderId: uuid.nullable().default(null),
    lineId: uuid.nullable().default(null),
    description: z.string().trim().min(1).max(300),
    committedCents: z.number().int().nonnegative().max(100000000000).default(0),
    receivedCents: z.number().int().nonnegative().max(100000000000).default(0),
    billedCents: z.number().int().nonnegative().max(100000000000).default(0),
    status: z.enum(["requisition", "committed", "received", "billed", "cancelled"]).default("requisition"),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const subcontractorInput = z.object({
    id: uuid, requestKey: uuid, expectedVersion: z.number().int().nonnegative().safe().default(0),
    supplierId: uuid.nullable().default(null),
    companyName: z.string().trim().min(1).max(200),
    contactName: z.string().trim().max(120).default(""),
    contactEmail: z.string().trim().max(160).default(""),
    contactPhone: z.string().trim().max(40).default(""),
    scope: z.string().trim().max(4000).default(""),
    phaseId: uuid.nullable().default(null),
    costCode: z.string().trim().max(60).default(""),
    commitmentCents: z.number().int().nonnegative().max(100000000000).default(0),
    retainageBps: z.number().int().min(0).max(5000).default(1000),
    coiExpiry: date.default(""),
    licenseExpiry: date.default(""),
    w9OnFile: z.boolean().default(false),
    status: z.enum(["onboarding", "active", "complete", "terminated"]).default("onboarding"),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const subChangeOrderInput = z.object({
    id: uuid, requestKey: uuid,
    title: z.string().trim().min(1).max(200),
    amountCents: z.number().int().min(-10000000000).max(10000000000),
    status: z.enum(["draft", "approved", "rejected"]).default("draft"),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const subInvoiceInput = z.object({
    id: uuid, requestKey: uuid,
    invoiceNumber: z.string().trim().min(1).max(80),
    periodEnd: date.default(""),
    grossCents: z.number().int().positive().max(100000000000),
    retainageCents: z.number().int().nonnegative().max(100000000000).default(0),
    accountingRef: z.string().trim().max(120).default(""),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const sovLineInput = z.object({
    id: uuid, requestKey: uuid, expectedVersion: z.number().int().nonnegative().safe().default(0),
    phaseId: uuid.nullable().default(null),
    costCode: z.string().trim().max(60).default(""),
    itemNumber: z.string().trim().min(1).max(40),
    description: z.string().trim().min(1).max(300),
    scheduledValueCents: z.number().int().nonnegative().max(100000000000),
    changeOrderId: uuid.nullable().default(null),
    position: z.number().int().nonnegative().default(0),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const billingAppInput = z.object({
    id: uuid, requestKey: uuid,
    periodStart: date.refine((v) => v !== "", "Choose a billing period start date."),
    periodEnd: date.refine((v) => v !== "", "Choose a billing period end date."),
    retainageBps: z.number().int().min(0).max(5000).optional(),
    lines: z.array(z.object({
        sovLineId: uuid,
        currentWorkCents: z.number().int().nonnegative().max(100000000000).default(0),
        materialsStoredCents: z.number().int().nonnegative().max(100000000000).default(0),
    }).strict()).min(1),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const billingAppActionInput = z.object({
    requestKey: uuid,
    expectedVersion: z.number().int().positive().safe(),
    action: z.enum(["review", "submit", "return", "approve", "record_payment"]),
    invoiceId: z.string().trim().max(120).optional(),
    paymentCents: z.number().int().positive().max(100000000000).optional(),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();

export const wipSnapshotInput = z.object({
    id: uuid, requestKey: uuid,
    asOfDate: date.refine((v) => v !== "", "Choose a reporting cutoff date."),
    method: z.enum(["cost_to_cost", "phase_progress"]).default("cost_to_cost"),
    correctionOf: uuid.nullable().default(null),
    reason: z.string().trim().min(10).max(2000),
    reviewAttested: z.literal(true),
}).strict();
