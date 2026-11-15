import { z } from "zod";

export class SalesError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export const isSalesAdmin = (user) =>
  Boolean(
    user?.active &&
      !user.mustChangePassword &&
      ["owner", "admin"].includes(user.role),
  );
export function requireWriter(user) {
  if (
    !user?.active ||
    user.mustChangePassword ||
    !["owner", "admin", "member"].includes(user.role)
  )
    throw new SalesError("Your account cannot change Sales records.", 403);
}
export function requireOwner(user, opportunity) {
  requireWriter(user);
  if (!isSalesAdmin(user) && opportunity.owner_id !== user.id)
    throw new SalesError(
      "Only the opportunity owner or an administrator can change it.",
      403,
    );
}
export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new SalesError(
      result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    );
  return result.data;
}
export const date = z
  .string()
  .refine(
    (value) =>
      value === "" ||
      (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value),
    "Choose a valid calendar date.",
  );
const text = (max) => z.string().trim().max(max);
const reference = z.string().uuid().nullable();
export const version = z.number().int().nonnegative().safe();
export const requiredFields = [
  "customerId",
  "expectedCloseDate",
  "expectedValue",
  "nextAction",
];
export const pipelineInput = z
  .object({
    name: text(100).min(1),
    expectedVersion: version.optional(),
    stages: z
      .array(
        z
          .object({
            id: z.string().uuid().optional(),
            name: text(80).min(1),
            kind: z.enum(["open", "won", "lost"]),
            probability: z.number().int().min(0).max(100),
            requiredFields: z.array(z.enum(requiredFields)).max(4),
            allowedFrom: z.array(z.string().uuid()).max(30),
          })
          .strict(),
      )
      .min(3)
      .max(20),
  })
  .strict();
export function validatePipeline(data) {
  if (
    !data.stages.some((stage) => stage.kind === "open") ||
    data.stages.filter((stage) => stage.kind === "won").length !== 1 ||
    data.stages.filter((stage) => stage.kind === "lost").length !== 1
  )
    throw new SalesError(
      "Include open stages and exactly one Won and one Lost stage.",
    );
  const names = data.stages.map((stage) => stage.name.toLowerCase());
  if (new Set(names).size !== names.length)
    throw new SalesError("Stage names must be unique.");
  for (const stage of data.stages) {
    if (
      (stage.kind === "won" && stage.probability !== 100) ||
      (stage.kind === "lost" && stage.probability !== 0)
    )
      throw new SalesError("Won probability must be 100%; Lost must be 0%.");
  }
}
export const opportunityInput = z
  .object({
    title: text(200).min(1),
    pipelineId: z.string().uuid(),
    stageId: z.string().uuid(),
    ownerId: z.string().min(1).max(100),
    prospectName: text(200),
    contactName: text(200),
    contactEmail: z.union([z.literal(""), z.string().email().max(254)]),
    contactPhone: text(80),
    segment: z.enum(["commercial", "residential"]),
    source: text(100),
    expectedValue: z.number().int().min(0).max(1_000_000_000),
    probability: z.number().int().min(0).max(100),
    expectedCloseDate: date,
    nextAction: text(1000),
    nextActionDate: date,
    customerId: reference,
    siteId: reference,
    assetId: reference,
    notes: text(8000),
    expectedVersion: version.optional(),
  })
  .strict()
  .refine(
    (data) => data.customerId || data.prospectName,
    "Choose a customer or enter a prospect name.",
  );
export const moveInput = z
  .object({
    stageId: z.string().uuid(),
    expectedVersion: version,
    reason: text(1000).default(""),
  })
  .strict();
export const noteInput = z
  .object({ content: text(8000).min(1), expectedVersion: version })
  .strict();
export function checkStage(stage, data) {
  if (stage.kind === "won")
    throw new SalesError(
      "Won is reserved for accepted quote conversion. Quote-to-job conversion is the next Sales module.",
      409,
    );
  const fields = JSON.parse(stage.required_fields);
  for (const field of fields)
    if (!data[field])
      throw new SalesError(`This stage requires ${field}.`, 409);
}
export function inputRecord(row) {
  return {
    title: row.title,
    pipelineId: row.pipeline_id,
    stageId: row.stage_id,
    ownerId: row.owner_id,
    prospectName: row.prospect_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    segment: row.segment,
    source: row.source,
    expectedValue: row.expected_value,
    probability: row.probability,
    expectedCloseDate: row.expected_close_date,
    nextAction: row.next_action,
    nextActionDate: row.next_action_date,
    customerId: row.customer_id,
    siteId: row.site_id,
    assetId: row.asset_id,
    notes: row.notes,
  };
}
