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
    note: text(500).optional().default(""),
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
    jurisdiction: text(200).optional().default(""),
    segment: z.enum(["residential", "commercial"]),
    effectiveFrom: date.refine(Boolean),
    effectiveTo: date.refine(Boolean).nullable(),
    active: z.boolean(),
    reviewNote: text(2000).optional().default(""),
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
    unitCostCents: cents.nullable(),
    unitSellCents: cents.nullable(),
    pricingPending: z.literal(true).optional(),
    pendingPricingNote: text(1000).optional(),
    discountBasisPoints: z.number().int().min(0).max(10000),
    materialId: z.string().uuid().nullable(),
    costOverrideReason: text(1000),
    travelGroup: text(80),
    includesFuel: z.boolean(),
    materialPricing: z.object({
      multiplierBasisPoints:z.number().int().min(0).max(100000),
      miscCents:cents,
    }).strict().optional(),
    laborRate:z.enum(['ot','dt']).optional(),
  })
  .strict()
  .superRefine((l, c) => {
    const fail = (message) => c.addIssue({ code: "custom", message });
    if(l.materialPricing&&l.kind!=="material")fail("Material worksheet adjustments apply only to materials.");
    if(l.laborRate&&!["technician","apprentice","after_hours"].includes(l.kind))fail("OT/DT rates apply only to labor.");
    if (l.pricingPending) {
      if (l.kind !== "material") fail("Pending pricing applies only to material draft lines.");
      if ((l.pendingPricingNote?.length ?? 0) < 10) fail("Describe the pending supplier pricing in at least 10 characters.");
    } else {
      if (l.unitCostCents === null || l.unitSellCents === null) fail("Complete costs and selling rates or mark material pricing pending.");
      if (l.pendingPricingNote) fail("A pending pricing note requires pending pricing mode.");
    }
    if (l.kind !== "material" && l.materialId) fail("Only material lines can link a catalog material.");
    if (l.kind === "material" && !l.materialId && !l.pricingPending) fail("Link a catalog material before completing material pricing.");
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
    const q = BigInt(l.quantityMilli) * BigInt(l.headcount);
    // New worksheet terms are optional. Old saved inputs retain their exact math.
    const premium=l.laborRate==='ot'?15000n:l.laborRate==='dt'?20000n:10000n;
    const effectiveCost=l.unitCostCents===null?null:round(BigInt(l.unitCostCents)*premium,10000n);
    const effectiveSell=l.unitSellCents===null?null:round(BigInt(l.unitSellCents)*premium*BigInt(10000+(l.materialPricing?.multiplierBasisPoints??0)),100000000n);
    const misc=BigInt(l.materialPricing?.miscCents??0);
    const cost=effectiveCost===null?null:round(q*effectiveCost,1000n),
      gross=effectiveSell===null?null:round(q*effectiveSell,1000n)+misc,
      discount=gross===null?null:round(gross*BigInt(l.discountBasisPoints),10000n),
      after=gross===null?null:gross-discount;
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
      tax = after === null ? null : ["inclusive", "exclusive"].includes(rule.treatment)
        ? round(
            after * rate,
            rule.treatment === "inclusive" ? 10000n + rate : 10000n,
          )
        : 0n;
    const net = after === null ? null : rule.treatment === "inclusive" ? after - tax : after,
      total = after === null ? null : rule.treatment === "exclusive" ? after + tax : after;
    return {
      ...l,
      ...(l.materialPricing||l.laborRate?{
        effectiveUnitCostCents:effectiveCost===null?null:bounded(effectiveCost),
        effectiveUnitSellCents:effectiveSell===null?null:bounded(effectiveSell),
      }:{}),
      costCents: cost === null ? null : bounded(cost),
      grossCents: gross === null ? null : bounded(gross),
      discountCents: discount === null ? null : bounded(discount),
      netCents: net === null ? null : bounded(net),
      taxCents: tax === null ? null : bounded(tax),
      totalCents: total === null ? null : bounded(total),
      taxCategory: category,
      taxRule: { ...rule },
    };
  });
  const known = (key) => bounded(result.reduce((n, l) => n + (l[key] === null ? 0n : BigInt(l[key])), 0n));
  const sum = (key) => result.some(l => l[key] === null) ? null : known(key),
    costCents = sum("costCents"),
    netCents = sum("netCents"),
    profitCents = netCents === null || costCents === null ? null : netCents - costCents;
  const ratio = (d) =>
    d && profitCents !== null ? Number((BigInt(profitCents) * 10000n) / BigInt(d)) : null;
  return {
    calculationVersion: lines.some(l=>l.materialPricing||l.laborRate) ? 3 : hasPendingPricing({lines:result}) ? 2 : 1,
    ...(hasPendingPricing({lines:result}) ? {pricingComplete:false, pendingLineIds:result.filter(l=>l.pricingPending).map(l=>l.id), knownTotals:Object.fromEntries(["costCents","grossCents","discountCents","netCents","taxCents","totalCents"].map(key=>[key,known(key)]))} : {}),
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

/** Incomplete pricing is a hard gate, never an administrator-overridable exception. */
export function hasPendingPricing(price) {
  return price.pricingComplete === false || price.lines.some(line => line.pricingPending || line.unitCostCents === null || line.unitSellCents === null || (line.kind === "material" && !line.materialId));
}
