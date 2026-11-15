import { z } from "zod";
import { SalesError, parse, date, version } from "./domain.mjs";
export const lineKinds = [
  "technician",
  "apprentice",
  "material",
  "service",
  "permit",
  "license",
  "distance",
  "fuel",
  "after_hours",
  "subcontractor",
];
export const taxCategories = ["labor", "material"];
export const lineTaxCategory = {
  technician: "labor",
  apprentice: "labor",
  after_hours: "labor",
  material: "material",
  service: null,
  distance: null,
  fuel: null,
  subcontractor: null,
  permit: null,
  license: null,
};
// Earlier local pilot profiles had one rule per line type. Preserve their stored
// revisions, expose a reviewable draft shape, and block use until an admin saves it.
export function reviewableProfile(config) {
  if (config.schemaVersion === 4) return { config, requiresReview: false };
  return {
    requiresReview: true,
    config: {
      ...config,
      schemaVersion: 4,
      rules: taxCategories.map((kind) => {
        const old = config.rules?.find((r) =>
          kind === "labor"
            ? ["labor", "technician"].includes(r.kind)
            : r.kind === kind,
        );
        return {
          kind,
          treatment: old?.treatment ?? "exclusive",
          rateBasisPoints: old?.rateBasisPoints ?? 0,
          note:
            kind === "labor"
              ? "Review one shared rule for technician, apprentice and after-hours labor."
              : (old?.note ?? ""),
        };
      }),
    },
  };
}
const text = (n) => z.string().trim().max(n);
const cents = z.number().int().min(0).max(1000000000);
export const taxRule = z
  .object({
    kind: z.enum(taxCategories),
    treatment: z.enum(["exclusive", "inclusive", "exempt", "outside_scope"]),
    rateBasisPoints: z.number().int().min(0).max(10000),
    note: text(500).min(10),
  })
  .strict()
  .refine(
    (r) =>
      ["exclusive", "inclusive"].includes(r.treatment) ||
      r.rateBasisPoints === 0,
    "Exempt/outside-scope lines must have zero tax rate.",
  );
export const profileConfig = z
  .object({
    schemaVersion: z.literal(4),
    name: text(120).min(1),
    state: z.string().regex(/^[A-Z]{2}$/),
    jurisdiction: text(200).min(1),
    segment: z.enum(["residential", "commercial"]),
    effectiveFrom: date.refine(Boolean),
    effectiveTo: date.refine(Boolean).nullable(),
    active: z.boolean(),
    reviewNote: text(2000).min(10),
    rules: z.array(taxRule).length(taxCategories.length),
  })
  .strict()
  .refine(
    (d) => !d.effectiveTo || d.effectiveTo >= d.effectiveFrom,
    "Effective end must follow start.",
  )
  .refine(
    (d) => new Set(d.rules.map((r) => r.kind)).size === taxCategories.length,
    "Review every line category exactly once.",
  );
export const saveProfileInput = z
  .object({
    id: z.string().uuid(),
    requestKey: z.string().uuid(),
    expectedVersion: version,
    config: profileConfig,
  })
  .strict();
export const estimateLine = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(lineKinds),
    description: text(500).min(1),
    quantityMilli: z.number().int().min(1).max(1000000000),
    headcount: z.number().int().min(1).max(100),
    unitCostCents: cents,
    unitSellCents: cents,
    discountBasisPoints: z.number().int().min(0).max(10000),
    materialId: z.string().uuid().nullable(),
    costOverrideReason: text(1000),
    travelGroup: text(80),
    includesFuel: z.boolean(),
  })
  .strict()
  .superRefine((l, c) => {
    const fail = (message) => c.addIssue({ code: "custom", message });
    if ((l.kind === "material") !== Boolean(l.materialId))
      fail("Only material lines require a catalog material.");
    if (
      !["technician", "apprentice", "after_hours"].includes(l.kind) &&
      l.headcount !== 1
    )
      fail("Headcount applies only to labor.");
    if (!["distance", "fuel"].includes(l.kind) && l.travelGroup)
      fail("Travel groups apply only to distance/fuel lines.");
    if (["distance", "fuel"].includes(l.kind) && !l.travelGroup)
      fail("Assign a travel group to distance/fuel lines.");
    if (l.includesFuel && l.kind !== "distance")
      fail("Fuel inclusion applies only to distance lines.");
  });
export const previewInput = z
  .object({
    opportunityId: z.string().uuid(),
    expectedOpportunityVersion: version,
    profileId: z.string().uuid(),
    expectedProfileVersion: version,
    pricingDate: date.refine(Boolean),
    lines: z.array(estimateLine).min(1).max(100),
  })
  .strict()
  .refine(
    (d) => new Set(d.lines.map((l) => l.id)).size === d.lines.length,
    "Estimate line identities must be unique.",
  );
const round = (n, d) => (n + d / 2n) / d;
const bounded = (n) => {
  if (n > 10000000000n)
    throw new SalesError(
      "Estimate exceeds the $100 million calculation limit.",
      422,
    );
  return Number(n);
};
// Pure exact-integer calculator. HTTP/application services supply authoritative inputs.
// No catalog reads, stock movements, acceptance, or customer communication here.
export function calculateEstimate(rawLines, rawProfile) {
  const profile = parse(profileConfig, rawProfile),
    lines = parse(z.array(estimateLine).min(1).max(100), rawLines);
  if (new Set(lines.map((l) => l.id)).size !== lines.length)
    throw new SalesError("Estimate line identities must be unique.");
  for (const l of lines)
    if (
      l.kind === "fuel" &&
      lines.some(
        (d) =>
          d.kind === "distance" &&
          d.travelGroup === l.travelGroup &&
          d.includesFuel,
      )
    )
      throw new SalesError(
        "Fuel is already included in this travel group. Remove the duplicate fuel charge.",
      );
  const result = lines.map((l) => {
    const q = BigInt(l.quantityMilli) * BigInt(l.headcount),
      cost = round(q * BigInt(l.unitCostCents), 1000n),
      gross = round(q * BigInt(l.unitSellCents), 1000n),
      discount = round(gross * BigInt(l.discountBasisPoints), 10000n),
      after = gross - discount;
    const category = lineTaxCategory[l.kind],
      rule = category
        ? profile.rules.find((r) => r.kind === category)
        : {
            kind: "non_taxable_fee",
            treatment: "outside_scope",
            rateBasisPoints: 0,
            note: "Only Labor and Materials have tax rules under company billing policy.",
          },
      rate = BigInt(rule.rateBasisPoints),
      tax = ["inclusive", "exclusive"].includes(rule.treatment)
        ? round(
            after * rate,
            rule.treatment === "inclusive" ? 10000n + rate : 10000n,
          )
        : 0n;
    const net = rule.treatment === "inclusive" ? after - tax : after,
      total = rule.treatment === "exclusive" ? after + tax : after;
    return {
      ...l,
      costCents: bounded(cost),
      grossCents: bounded(gross),
      discountCents: bounded(discount),
      netCents: bounded(net),
      taxCents: bounded(tax),
      totalCents: bounded(total),
      taxCategory: category,
      taxRule: { ...rule },
    };
  });
  const sum = (key) => bounded(result.reduce((n, l) => n + BigInt(l[key]), 0n)),
    costCents = sum("costCents"),
    netCents = sum("netCents"),
    profitCents = netCents - costCents;
  const ratio = (d) =>
    d ? Number((BigInt(profitCents) * 10000n) / BigInt(d)) : null;
  return {
    calculationVersion: 1,
    currency: "USD",
    rounding: "half_up_per_line_cent",
    profile,
    lines: result,
    costCents,
    grossCents: sum("grossCents"),
    discountCents: sum("discountCents"),
    netCents,
    taxCents: sum("taxCents"),
    totalCents: sum("totalCents"),
    profitCents,
    marginBasisPoints: ratio(netCents),
    markupBasisPoints: ratio(costCents),
  };
}
