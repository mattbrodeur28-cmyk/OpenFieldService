import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStorage } from "../src/server/sqlite.mjs";
import { createSales } from "../src/server/sales/http.mjs";
import { createSalesService } from "../src/server/sales/service.mjs";
import { createBillingProfiles } from "../src/server/sales/billing-profiles.mjs";
import {
  calculateEstimate,
  lineKinds,
  taxCategories,
} from "../src/server/sales/estimating-domain.mjs";
import { quoteMaterialSnapshots } from "../src/server/inventory/quote-pricing.mjs";
import { migrate } from "../src/server/platform/sqlite.mjs";
import {
  inventorySchema,
  companyCostSchema,
} from "../src/server/inventory/schema.mjs";
const owner = { id: "owner", role: "owner", active: true },
  member = { id: "member", role: "member", active: true },
  other = { id: "other", role: "member", active: true },
  viewer = { id: "viewer", role: "viewer", active: true };
const profile = (extra = {}) => ({
  schemaVersion: 4,
  name: "Reviewed test profile",
  state: "MA",
  jurisdiction: "Fixture jurisdiction only",
  segment: "commercial",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  active: true,
  reviewNote: "Disposable test values, not legal rates",
  rules: taxCategories.map((kind) => ({
    kind,
    treatment: "exclusive",
    rateBasisPoints: 725,
    note: "Reviewed fixture tax treatment",
  })),
  ...extra,
});
const line = (extra = {}) => ({
  id: randomUUID(),
  kind: "technician",
  description: "Technician labor",
  quantityMilli: 2500,
  headcount: 2,
  unitCostCents: 3000,
  unitSellCents: 10000,
  discountBasisPoints: 0,
  materialId: null,
  costOverrideReason: "",
  travelGroup: "",
  includesFuel: false,
  ...extra,
});
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "ofs-estimating-")),
    storage = openStorage(join(dir, "service.sqlite"));
  t.after(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const owners = () => [owner, member, other],
    sales = createSalesService({ storage, owners }),
    p = sales.pipelines()[0];
  const opportunity = sales.saveOpportunity(member, null, {
    title: "Commercial controls bid",
    pipelineId: p.id,
    stageId: p.stages[0].id,
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
  const profiles = createBillingProfiles({
    storage,
    sales,
    materialSnapshots: (ids) => quoteMaterialSnapshots(storage.database, ids),
  });
  return { storage, owners, sales, profiles, opportunity };
}
const command = (config = profile()) => ({
  id: randomUUID(),
  requestKey: randomUUID(),
  expectedVersion: 0,
  config,
});
const preview = (opportunity, p, extra = {}) => ({
  opportunityId: opportunity.id,
  expectedOpportunityVersion: opportunity.version,
  profileId: p.id,
  expectedProfileVersion: p.version,
  pricingDate: "2026-11-15",
  lines: [line()],
  ...extra,
});

test("Estimator calculates labor headcount, discounts and mixed inclusive/exclusive taxes without floats", () => {
  const p = profile();
  p.rules.find((r) => r.kind === "material").treatment = "inclusive";
  p.rules.find((r) => r.kind === "material").rateBasisPoints = 1000;
  const r = calculateEstimate(
    [
      line({ discountBasisPoints: 1000 }),
      line({
        kind: "material",
        materialId: randomUUID(),
        quantityMilli: 1000,
        headcount: 1,
        unitCostCents: 500,
        unitSellCents: 1100,
      }),
      line({
        kind: "permit",
        headcount: 1,
        quantityMilli: 1000,
        unitCostCents: 10000,
        unitSellCents: 10000,
      }),
    ],
    p,
  );
  assert.deepEqual(
    r.lines.map((l) => [l.costCents, l.netCents, l.taxCents, l.totalCents]),
    [
      [15000, 45000, 3263, 48263],
      [500, 1000, 100, 1100],
      [10000, 10000, 0, 10000],
    ],
  );
  assert.equal(r.costCents, 25500);
  assert.equal(r.netCents, 56000);
  assert.equal(r.totalCents, 59363);
  assert.equal(r.profitCents, 30500);
  assert.equal(r.marginBasisPoints, 5446);
  assert.equal(r.markupBasisPoints, 11960);
  assert.equal(r.rounding, "half_up_per_line_cent");
  const fractional = calculateEstimate(
    [
      line({
        quantityMilli: 500,
        headcount: 1,
        unitSellCents: 1,
        unitCostCents: 1,
      }),
    ],
    profile({
      rules: taxCategories.map((kind) => ({
        kind,
        treatment: "exempt",
        rateBasisPoints: 0,
        note: "Fixture exemption reviewed",
      })),
    }),
  );
  assert.equal(fractional.netCents, 1);
  assert.equal(fractional.costCents, 1);
  const zero = calculateEstimate(
    [line({ unitSellCents: 0, unitCostCents: 0 })],
    profile(),
  );
  assert.equal(zero.marginBasisPoints, null);
  assert.equal(zero.markupBasisPoints, null);
});

test("Estimator rejects duplicate fuel, malformed categories and quantities, missing review and overflow", () => {
  const distance = line({
    kind: "distance",
    quantityMilli: 10000,
    headcount: 1,
    travelGroup: "visit-1",
    includesFuel: true,
  });
  const fuel = line({ kind: "fuel", headcount: 1, travelGroup: "visit-1" });
  assert.throws(
    () => calculateEstimate([distance, fuel], profile()),
    /already included/,
  );
  assert.equal(
    calculateEstimate(
      [distance, { ...fuel, travelGroup: "visit-2" }],
      profile(),
    ).lines.length,
    2,
  );
  for (const patch of [
    { quantityMilli: 0 },
    { quantityMilli: 1.5 },
    { headcount: 0 },
    { unitCostCents: -1 },
    { discountBasisPoints: 10001 },
    { kind: "material", materialId: null },
    { kind: "service", headcount: 2 },
    { includesFuel: true },
  ])
    assert.throws(() => calculateEstimate([line(patch)], profile()));
  const l = line();
  assert.throws(() => calculateEstimate([l, l], profile()), /unique/);
  assert.throws(() =>
    calculateEstimate([line()], profile({ rules: profile().rules.slice(1) })),
  );
  assert.throws(() =>
    calculateEstimate([line()], profile({ reviewNote: "bad" })),
  );
  assert.throws(
    () =>
      calculateEstimate(
        [line({ unitCostCents: 1000000000, quantityMilli: 1000000000 })],
        profile(),
      ),
    /limit/,
  );
});

test("Billing profiles are admin reviewed, version guarded, immutable and actor-bound idempotent", (t) => {
  const { profiles, storage } = fixture(t),
    c = command();
  for (const u of [
    member,
    viewer,
    { ...member, hr: true },
    { ...owner, active: false },
    { ...owner, mustChangePassword: true },
  ])
    assert.throws(() => profiles.save(u, c), /Owners\/Admins/);
  const first = profiles.save(owner, c).profile;
  assert.equal(first.version, 1);
  assert.deepEqual(profiles.save(owner, c).profile, first);
  assert.throws(
    () =>
      profiles.save(owner, {
        ...c,
        config: { ...c.config, name: "Altered retry" },
      }),
    /different content/,
  );
  assert.throws(
    () => profiles.save({ ...owner, id: "admin-2" }, c),
    /another user/,
  );
  const next = profiles.save(owner, {
    ...command({ ...c.config, name: "Second revision" }),
    id: c.id,
    expectedVersion: 1,
  }).profile;
  assert.equal(next.version, 2);
  assert.equal(profiles.save(owner, c).profile.version, 1);
  assert.throws(
    () => profiles.save(owner, { ...command(), id: c.id, expectedVersion: 1 }),
    /changed/,
  );
  assert.equal(profiles.list(member).profiles[0].version, 2);
  assert.throws(() => profiles.list(viewer), /writer/);
  assert.throws(() => profiles.list(owner, { page: 0 }), /page/);
  assert.equal(
    storage.database
      .prepare("SELECT COUNT(*) AS n FROM _sales_billing_profile_revisions")
      .get().n,
    2,
  );
  assert.throws(
    () =>
      storage.database.exec(
        "UPDATE _sales_billing_profile_revisions SET actor_id='x'",
      ),
    /IMMUTABLE/,
  );
  assert.throws(
    () => storage.database.exec("DELETE FROM _sales_billing_profile_requests"),
    /IMMUTABLE/,
  );
});

test("Estimate preview enforces opportunity ownership, segment/date, current profile/version and returns no persisted sale", (t) => {
  const { profiles, opportunity, storage } = fixture(t),
    p = profiles.save(owner, command()).profile,
    input = preview(opportunity, p);
  const r = profiles.preview(member, input);
  assert.equal(r.persisted, false);
  assert.equal(r.profileVersion, 1);
  assert.equal(r.opportunityVersion, 0);
  assert.equal(r.totalCents, 53625);
  for (const u of [
    other,
    viewer,
    { ...member, active: false },
    { ...member, mustChangePassword: true },
  ])
    assert.throws(() => profiles.preview(u, input), /owner|cannot change/);
  for (const patch of [
    { expectedOpportunityVersion: 1 },
    { expectedProfileVersion: 0 },
    { pricingDate: "2025-12-31" },
  ])
    assert.throws(
      () => profiles.preview(member, { ...input, ...patch }),
      /changed|active profile/,
    );
  const residential = profiles.save(
    owner,
    command(profile({ segment: "residential" })),
  ).profile;
  assert.throws(
    () => profiles.preview(member, preview(opportunity, residential)),
    /segment/,
  );
  const disabled = profiles.save(
    owner,
    command(profile({ active: false })),
  ).profile;
  assert.throws(
    () => profiles.preview(member, preview(opportunity, disabled)),
    /active profile/,
  );
  assert.equal(
    storage.database.prepare("SELECT COUNT(*) AS n FROM jobs").get().n,
    0,
  );
});

test("Native material snapshots use company stock and reviewed overrides without posting stock or historical job costs", (t) => {
  const { profiles, opportunity, storage } = fixture(t),
    db = storage.database;
  migrate(db, "_inventory_migrations", [
    { version: 1, sql: inventorySchema },
    { version: 2, sql: companyCostSchema },
  ]);
  const id = randomUUID(),
    location = randomUUID();
  db.prepare(
    "INSERT INTO materials(id,name,unit,unit_cost,in_stock) VALUES(?,?,?,?,?)",
  ).run(id, "Native relay", "ea", 99, 0);
  db.prepare(
    "INSERT INTO _inventory_locations(id,name,code,kind,active) VALUES(?,?,?,'warehouse',1)",
  ).run(location, "Fixture warehouse", "EST-1");
  db.prepare(
    "INSERT INTO _inventory_materials(material_id,actor_id) VALUES(?,?)",
  ).run(id, owner.id);
  db.prepare(
    "INSERT INTO _inventory_balances(location_id,material_id,quantity_milli,value_millicents,version) VALUES(?,?,10000,15000000,1)",
  ).run(location, id);
  const p = profiles.save(owner, command()).profile,
    l = line({
      kind: "material",
      materialId: id,
      headcount: 1,
      quantityMilli: 1000,
      unitCostCents: 1500,
    });
  const r = profiles.preview(member, preview(opportunity, p, { lines: [l] }));
  assert.equal(r.costCents, 1500);
  assert.equal(r.materialSnapshots[0].unitCostCents, 1500);
  assert.equal(r.materialSnapshots[0].source, "company_weighted_average");
  assert.throws(
    () =>
      profiles.preview(
        member,
        preview(opportunity, p, { lines: [{ ...l, unitCostCents: 1000 }] }),
      ),
    /override/,
  );
  assert.equal(
    profiles.preview(
      member,
      preview(opportunity, p, {
        lines: [
          {
            ...l,
            unitCostCents: 1000,
            costOverrideReason: "Reviewed supplier bid",
          },
        ],
      }),
    ).costCents,
    1000,
  );
  const old = r.materialSnapshots[0].sourceVersion;
  db.prepare(
    "UPDATE _inventory_balances SET value_millicents='20000000',version=2 WHERE material_id=?",
  ).run(id);
  const repriced = profiles.preview(
    member,
    preview(opportunity, p, { lines: [{ ...l, unitCostCents: 2000 }] }),
  );
  assert.notEqual(repriced.materialSnapshots[0].sourceVersion, old);
  assert.equal(r.costCents, 1500);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM _inventory_movements").get().n,
    0,
  );
  const noStock = randomUUID();
  db.prepare("INSERT INTO materials(id,name,unit) VALUES(?,?,?)").run(
    noStock,
    "New catalog material",
    "ea",
  );
  assert.throws(
    () =>
      profiles.preview(
        member,
        preview(opportunity, p, {
          lines: [{ ...l, materialId: noStock, unitCostCents: 0 }],
        }),
      ),
    /override/,
  );
  const fallback = profiles.preview(
    member,
    preview(opportunity, p, {
      lines: [
        {
          ...l,
          materialId: noStock,
          unitCostCents: 1800,
          costOverrideReason: "Current supplier quote reviewed",
        },
      ],
    }),
  );
  assert.equal(fallback.materialSnapshots[0].unitCostCents, null);
  assert.equal(fallback.costCents, 1800);
});

test("A profile journal failure rolls back head and review revisions, allowing exact retry", (t) => {
  const { profiles, storage } = fixture(t),
    db = storage.database,
    c = command();
  db.exec(
    "CREATE TRIGGER reject_profile_ack BEFORE INSERT ON _sales_billing_profile_requests BEGIN SELECT RAISE(ABORT,'fixture journal failure');END;",
  );
  assert.throws(() => profiles.save(owner, c), /journal failure/);
  assert.equal(profiles.list(owner).profiles.length, 0);
  assert.equal(
    db
      .prepare("SELECT COUNT(*) AS n FROM _sales_billing_profile_revisions")
      .get().n,
    0,
  );
  db.exec("DROP TRIGGER reject_profile_ack");
  assert.equal(profiles.save(owner, c).profile.version, 1);
});

test("Sales pricing HTTP checks sessions, verification, streamed size and role changes during body reads", async (t) => {
  const { storage, owners } = fixture(t);
  let actor = owner;
  const { app } = createSales({ storage, owners, currentUser: () => actor });
  const request = (data) =>
    app.request("/billing-profiles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "OpenFieldService",
      },
      body: JSON.stringify(data),
    });
  assert.equal((await request(command())).status, 200);
  actor = null;
  assert.equal((await app.request("/billing-profiles")).status, 401);
  actor = viewer;
  assert.equal((await app.request("/billing-profiles")).status, 403);
  actor = member;
  assert.equal((await request(command())).status, 403);
  actor = owner;
  assert.equal(
    (await app.request("/billing-profiles", { method: "POST", body: "{}" }))
      .status,
    403,
  );
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(" ".repeat(60000)));
      c.close();
    },
  });
  assert.equal(
    (
      await app.request("/billing-profiles", {
        method: "POST",
        headers: { "X-Requested-With": "OpenFieldService" },
        body: stream,
        duplex: "half",
      })
    ).status,
    413,
  );
  const delayed = new ReadableStream({
    start(c) {
      setTimeout(() => {
        actor = member;
        c.enqueue(new TextEncoder().encode(JSON.stringify(command())));
        c.close();
      }, 5);
    },
  });
  assert.equal(
    (
      await app.request("/billing-profiles", {
        method: "POST",
        headers: { "X-Requested-With": "OpenFieldService" },
        body: delayed,
        duplex: "half",
      })
    ).status,
    403,
  );
});

test("One Labor rule taxes technician, apprentice and after-hours identically; permits/licensing/subcontractors/fuel never add tax", () => {
  const p = profile(),
    kinds = [
      "technician",
      "apprentice",
      "after_hours",
      "permit",
      "license",
      "subcontractor",
      "fuel",
      "service",
      "distance",
    ];
  const result = calculateEstimate(
    kinds.map((kind) =>
      line({
        kind,
        headcount: 1,
        quantityMilli: 1000,
        unitSellCents: 10000,
        travelGroup: ["fuel", "distance"].includes(kind) ? kind : "",
      }),
    ),
    p,
  );
  assert.deepEqual(
    result.lines.map((l) => l.taxCents),
    [725, 725, 725, 0, 0, 0, 0, 0, 0],
  );
  assert.deepEqual(
    result.lines.map((l) => l.taxCategory),
    ["labor", "labor", "labor", null, null, null, null, null, null],
  );
  assert.throws(() =>
    calculateEstimate([line({ kind: "fee", headcount: 1 })], p),
  );
  assert.throws(() =>
    calculateEstimate([line()], {
      ...p,
      rules: [
        ...p.rules,
        {
          kind: "permit",
          treatment: "exclusive",
          rateBasisPoints: 725,
          note: "Attempt to tax permit fees",
        },
      ],
    }),
  );
});

test("Earlier split-labor pilot profiles require explicit admin review without changing old revision evidence", (t) => {
  const { profiles, storage, opportunity } = fixture(t),
    db = storage.database,
    id = randomUUID(),
    old = profile();
  delete old.schemaVersion;
  old.rules = [
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
    "fee",
  ].map((kind) => ({
    kind,
    treatment: "exclusive",
    rateBasisPoints: kind === "after_hours" ? 1000 : 725,
    note: "Earlier split category review",
  }));
  const original = JSON.stringify(old);
  db.prepare(
    "INSERT INTO _sales_billing_profiles(id,version,config_json) VALUES(?,1,?)",
  ).run(id, original);
  db.prepare(
    "INSERT INTO _sales_billing_profile_revisions(profile_id,version,actor_id,config_json) VALUES(?,1,?,?)",
  ).run(id, owner.id, original);
  const draft = profiles.list(owner).profiles[0];
  assert.equal(draft.requiresReview, true);
  assert.deepEqual(
    draft.config.rules.map((r) => r.kind),
    taxCategories,
  );
  assert.equal(draft.config.schemaVersion, 4);
  assert.throws(
    () => profiles.preview(member, preview(opportunity, draft)),
    /current billing tax/,
  );
  const reviewed = profiles.save(owner, {
    ...command(draft.config),
    id,
    expectedVersion: 1,
  }).profile;
  assert.equal(reviewed.requiresReview, false);
  assert.equal(reviewed.version, 2);
  assert.equal(
    profiles.preview(member, preview(opportunity, reviewed)).profileVersion,
    2,
  );
  assert.equal(
    db
      .prepare(
        "SELECT config_json FROM _sales_billing_profile_revisions WHERE profile_id=? AND version=1",
      )
      .get(id).config_json,
    original,
  );
});

test('worksheet material multiplier adds thirty percent, retains acquisition cost and applies flat Misc once',()=>{
 const result=calculateEstimate([line({kind:'material',materialId:randomUUID(),description:'Material worksheet',quantityMilli:2000,headcount:1,unitCostCents:10000,unitSellCents:10000,discountBasisPoints:1000,materialPricing:{multiplierBasisPoints:3000,miscCents:500}})],profile());
 assert.equal(result.calculationVersion,3);assert.equal(result.lines[0].effectiveUnitSellCents,13000);assert.equal(result.costCents,20000);assert.equal(result.grossCents,26500);assert.equal(result.discountCents,2650);assert.equal(result.netCents,23850);assert.equal(result.taxCents,1729);assert.equal(result.totalCents,25579);
});
test('worksheet OT and DT apply one-and-a-half and double labor rates with the common labor tax category',()=>{
 for(const kind of ['technician','apprentice','after_hours'])for(const [laborRate,rate,cost] of [['ot',22500,7500],['dt',30000,10000]]){
  const result=calculateEstimate([line({kind,quantityMilli:1000,headcount:1,unitCostCents:5000,unitSellCents:15000,laborRate})],profile());assert.equal(result.lines[0].effectiveUnitSellCents,rate);assert.equal(result.lines[0].effectiveUnitCostCents,cost);assert.equal(result.grossCents,rate);assert.equal(result.lines[0].taxCategory,'labor');
 }
 assert.throws(()=>calculateEstimate([line({kind:'permit',laborRate:'ot'})],profile()),/only to labor/);assert.throws(()=>calculateEstimate([line({kind:'technician',materialPricing:{multiplierBasisPoints:3000,miscCents:0}})],profile()),/only to materials/);
});
test('worksheet additions leave old inputs on their original calculation version and retain pending unknowns',()=>{
 const original=line({quantityMilli:1000,headcount:1});const old=calculateEstimate([original],profile());assert.equal(old.calculationVersion,1);assert.equal(old.grossCents,10000);assert.equal(old.costCents,3000);assert.equal(old.lines[0].effectiveUnitSellCents,undefined);
 const pending=calculateEstimate([line({kind:'material',quantityMilli:1000,headcount:1,unitCostCents:null,unitSellCents:null,pricingPending:true,pendingPricingNote:'Waiting for supply house quotation.',materialPricing:{multiplierBasisPoints:3000,miscCents:500}})],profile());assert.equal(pending.calculationVersion,3);assert.equal(pending.pricingComplete,false);assert.equal(pending.costCents,null);assert.equal(pending.totalCents,null);assert.equal(pending.lines[0].effectiveUnitSellCents,null);assert.equal(pending.knownTotals.totalCents,0);
});
test('permit, licensing, subcontractor, fuel, distance and service rows remain outside labor/material tax',()=>{
 for(const kind of ['permit','license','subcontractor','fuel','distance','service']){const result=calculateEstimate([line({kind,quantityMilli:1000,headcount:1,travelGroup:['fuel','distance'].includes(kind)?'travel-test':''})],profile());assert.equal(result.taxCents,0);assert.equal(result.lines[0].taxCategory,null);}
});
