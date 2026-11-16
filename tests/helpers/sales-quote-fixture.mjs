import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStorage } from "../../src/server/sqlite.mjs";
import { createSales } from "../../src/server/sales/http.mjs";
export const owner = { id: "quote-owner", role: "owner", active: true },
  member = { id: "quote-member", role: "member", active: true },
  other = { id: "quote-other", role: "member", active: true },
  viewer = { id: "quote-viewer", role: "viewer", active: true };
export function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "ofs-quotes-"));
  const storage = openStorage(join(directory, "service.sqlite"));
  t.after(() => {
    storage.close();
    rmSync(directory, { recursive: true, force: true });
  });
  let actor = member,
    cost = 1200;
  const materialId = randomUUID();
  storage.database
    .prepare(
      "INSERT INTO materials(id,name,unit,unit_cost,in_stock) VALUES(?,?,?,?,?)",
    )
    .run(materialId, "Native quote relay", "ea", 12, 0);
  const options = {
    storage,
    owners: () => [owner, member, other],
    currentUser: () => actor,
    materialSnapshots: (ids) =>
      ids.map((id) => ({
        id,
        name: "Native quote relay",
        unit: "ea",
        unitCostCents: cost,
        sourceVersion: "fixture-" + cost,
      })),
  };
  const module = createSales(options),
    pipeline = module.service.pipelines()[0];
  const opportunity = module.service.saveOpportunity(member, null, {
    title: "Native bid",
    pipelineId: pipeline.id,
    stageId: pipeline.stages[0].id,
    ownerId: member.id,
    prospectName: "Fixture prospect",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    segment: "commercial",
    source: "",
    expectedValue: 0,
    probability: 10,
    expectedCloseDate: "",
    nextAction: "",
    nextActionDate: "",
    customerId: null,
    siteId: null,
    assetId: null,
    notes: "",
  });
  const profile = module.billingProfiles.save(owner, {
    id: randomUUID(),
    requestKey: randomUUID(),
    expectedVersion: 0,
    config: {
      schemaVersion: 4,
      name: "Fixture only",
      state: "MA",
      jurisdiction: "Fixture jurisdiction",
      segment: "commercial",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      active: true,
      reviewNote: "Fixture configuration, not tax advice",
      rules: ["labor", "material"].map((kind) => ({
        kind,
        treatment: "exclusive",
        rateBasisPoints: 500,
        note: "Reviewed fixture category only",
      })),
    },
  }).profile;
  const line = {
    id: randomUUID(),
    kind: "material",
    description: "Native relay",
    quantityMilli: 2500,
    headcount: 1,
    unitCostCents: 1200,
    unitSellCents: 2000,
    discountBasisPoints: 0,
    materialId,
    costOverrideReason: "",
    travelGroup: "",
    includesFuel: false,
  };
  const command = () => ({
    id: randomUUID(),
    requestKey: randomUUID(),
    expectedVersion: 0,
    document: {
      title: "Controls estimate",
      scope: "Replace the specified relay and verify operation.",
      exclusions: "No controls programming included.",
      validUntil: "2026-12-15",
    },
    estimate: {
      opportunityId: opportunity.id,
      expectedOpportunityVersion: opportunity.version,
      profileId: profile.id,
      expectedProfileVersion: profile.version,
      pricingDate: "2026-11-15",
      lines: [{ ...line }],
    },
  });
  return {
    ...module,
    storage,
    options,
    opportunity,
    profile,
    command,
    materialId,
    setCost: (value) => (cost = value),
    setActor: (value) => (actor = value),
  };
}
