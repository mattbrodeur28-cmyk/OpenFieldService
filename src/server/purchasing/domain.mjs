import { z } from "zod";
import { version, quantity, cost, reason, fail } from "../inventory/domain.mjs";
export const uuid = z.string().uuid();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return (
      Number.isFinite(d.valueOf()) &&
      d.toISOString().slice(0, 10) === v &&
      v >= "2000-01-01" &&
      v <= "2100-12-31"
    );
  }, "Choose a real expected-delivery date.");
const common = { requestKey: uuid, reason };
export const supplierInput = z
  .object({
    ...common,
    id: uuid,
    expectedVersion: version,
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,32}$/),
    name: z.string().trim().min(1).max(160),
    contactName: z.string().trim().max(120),
    email: z.union([z.literal(""), z.string().trim().email().max(254)]),
    phone: z.string().trim().max(80),
    address: z.string().trim().max(2000),
    terms: z.string().trim().max(2000),
    active: z.boolean(),
  })
  .strict();
export const orderInput = z
  .object({
    ...common,
    id: uuid,
    expectedVersion: version,
    supplierId: uuid,
    locationId: uuid,
    currency: z.literal("USD"),
    expectedDate: date.nullable(),
    terms: z.string().trim().max(2000),
    notes: z.string().trim().max(2000),
    taxBasisPoints: z.number().int().min(0).max(10000),
    freightCents: cost,
    lines: z
      .array(
        z
          .object({
            id: uuid,
            materialId: uuid,
            jobId: uuid.nullable(),
            description: z.string().trim().max(500),
            quantityMilli: quantity,
            unitCostCents: cost,
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .refine(
    (d) => new Set(d.lines.map((l) => l.id)).size === d.lines.length,
    "Each purchase line needs a distinct identity.",
  );
export const actionInput = z
  .object({
    ...common,
    orderId: uuid,
    expectedVersion: version,
    action: z.enum(["approve", "issue", "return_to_draft", "cancel", "close"]),
  })
  .strict();
export const receiptInput = z
  .object({
    ...common,
    orderId: uuid,
    lineId: uuid,
    expectedVersion: version,
    expectedStockVersion: version,
    deliveredMilli: quantity,
    acceptedMilli: z.number().int().min(0).max(1000000000),
    rejectedMilli: z.number().int().min(0).max(1000000000),
    unitCostCents: cost,
    packingSlip: z.string().trim().max(120),
    priceVarianceReason: z.string().trim().max(1000),
    approveOverReceipt: z.boolean(),
    overReceiptReason: z.string().trim().max(1000),
  })
  .strict()
  .refine(
    (d) => d.deliveredMilli === d.acceptedMilli + d.rejectedMilli,
    "Delivered quantity must equal accepted plus rejected.",
  );
export function totals(lines, taxBasisPoints, freightCents) {
  const subtotal = lines.reduce(
    (n, l) =>
      n +
      (BigInt(l.quantity_milli ?? l.quantityMilli) *
        BigInt(l.unit_cost_cents ?? l.unitCostCents) +
        500n) /
        1000n,
    0n,
  );
  const tax = (subtotal * BigInt(taxBasisPoints) + 5000n) / 10000n,
    total = subtotal + tax + BigInt(freightCents);
  if (total > 10000000000n)
    fail("This purchase exceeds the supported $100 million review limit.", 422);
  return {
    subtotalCents: Number(subtotal),
    taxCents: Number(tax),
    freightCents,
    totalCents: Number(total),
  };
}
