import { z } from "zod";
import { ServiceIdentityError } from "../service/identity.mjs";
export const fail = (message, status = 400) => {
  throw new ServiceIdentityError(message, status);
};
export const admin = (u) =>
  Boolean(
    u?.active && !u.mustChangePassword && ["owner", "admin"].includes(u.role),
  );
export const writer = (u) =>
  Boolean(
    u?.active &&
      !u.mustChangePassword &&
      ["owner", "admin", "member"].includes(u.role),
  );
export const version = z.number().int().min(0).safe();
export const quantity = z.number().int().min(1).max(1000000000);
export const cost = z.number().int().min(0).max(100000000);
export const reason = z.string().trim().min(10).max(1000);
const base = z.object({
  requestKey: z.string().uuid(),
  materialId: z.string().uuid(),
  quantityMilli: quantity,
  reason,
});
export const schemas = {
  receipt: base
    .extend({
      locationId: z.string().uuid(),
      expectedVersion: version,
      unitCostCents: cost,
      opening: z.boolean().default(false),
    })
    .strict(),
  transfer: base
    .extend({
      fromLocationId: z.string().uuid(),
      toLocationId: z.string().uuid(),
      expectedFromVersion: version,
      expectedToVersion: version,
    })
    .strict(),
  usage: base
    .extend({
      locationId: z.string().uuid(),
      expectedVersion: version,
      jobId: z.string().uuid(),
      delegationReason: z.string().trim().max(1000).default(""),
    })
    .strict(),
  return: z
    .object({
      requestKey: z.string().uuid(),
      jobMaterialId: z.string().uuid(),
      toLocationId: z.string().uuid(),
      quantityMilli: quantity,
      expectedUsageVersion: version,
      expectedToVersion: version,
      reason,
      delegationReason: z.string().trim().max(1000).default(""),
    })
    .strict(),
  adjustment: z
    .object({
      requestKey: z.string().uuid(),
      materialId: z.string().uuid(),
      locationId: z.string().uuid(),
      countedMilli: z.number().int().min(0).max(1000000000000),
      expectedVersion: version,
      unitCostCents: cost,
      reason,
      approved: z.literal(true),
    })
    .strict(),
  reversal: z
    .object({
      requestKey: z.string().uuid(),
      movementId: z.string().uuid(),
      reason,
    })
    .strict(),
  location: z
    .object({
      id: z.string().uuid().optional(),
      expectedVersion: version,
      name: z.string().trim().min(1).max(120),
      code: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9_-]{1,32}$/),
      kind: z.enum(["warehouse", "truck"]),
      technicianId: z.string().uuid().nullable(),
      active: z.boolean(),
      reason,
    })
    .strict(),
  policy: z
    .object({
      locationId: z.string().uuid(),
      materialId: z.string().uuid(),
      expectedVersion: version,
      reorderMilli: z.number().int().min(0).max(1000000000),
      reason,
    })
    .strict(),
};
export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success)
    fail(result.error.issues.map((i) => i.message).join("; "));
  return result.data;
}
export const proportional = (value, part, whole) => {
  const n = BigInt(value) * BigInt(part),
    d = BigInt(whole);
  return (n + d / 2n) / d;
};
export function legacyMilli(value) {
  const milli = Math.round(value * 1000);
  if (
    !Number.isFinite(value) ||
    milli < 0 ||
    milli > 1000000000 ||
    Math.abs(milli - value * 1000) > 0.000001
  )
    fail(
      "Review the existing quantity: it must be nonnegative and use at most three decimal places.",
      409,
    );
  return milli;
}
