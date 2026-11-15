import { editLine, lineInput } from "../src/client/quote-input.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStorage } from "../src/server/sqlite.mjs";
import { createSales } from "../src/server/sales/http.mjs";
const owner = { id: "quote-owner", role: "owner", active: true },
  member = { id: "quote-member", role: "member", active: true },
  other = { id: "quote-other", role: "member", active: true },
  viewer = { id: "quote-viewer", role: "viewer", active: true };
function fixture(t) {
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
test("quote saves freeze exact pricing and revisions while retaining native material IDs", (t) => {
  const f = fixture(t),
    cmd = f.command(),
    first = f.quotes.save(member, cmd).quote;
  assert.equal(first.identifier, "Q-000001");
  assert.equal(first.status, "draft");
  assert.equal(first.estimate.totalCents, 5250);
  assert.equal(first.estimate.costCents, 3000);
  assert.equal(first.estimate.persisted, true);
  assert.equal(first.estimate.kind, "internal_draft");
  assert.equal(first.estimate.materialSnapshots[0].id, f.materialId);
  f.setCost(1500);
  const changed = {
    ...cmd,
    requestKey: randomUUID(),
    expectedVersion: 1,
    document: { ...cmd.document, scope: "Updated commissioning scope" },
    estimate: {
      ...cmd.estimate,
      lines: [{ ...cmd.estimate.lines[0], unitCostCents: 1500 }],
    },
  };
  const second = f.quotes.save(member, changed).quote;
  assert.equal(second.version, 2);
  assert.equal(second.estimate.costCents, 3750);
  const earlier = f.quotes.detail(member, cmd.id, { revision: "1" });
  assert.equal(earlier.quote.estimate.costCents, 3000);
  assert.equal(earlier.quote.document.scope, cmd.document.scope);
  assert.equal(earlier.history.length, 2);
  const refs = f.storage.database
    .prepare(
      "SELECT material_id FROM _sales_quote_revision_lines WHERE quote_id=?",
    )
    .all(cmd.id);
  assert.equal(refs.length, 2);
  assert.ok(refs.every((r) => r.material_id === f.materialId));
  assert.equal(
    f.storage.database.prepare("SELECT COUNT(*) AS n FROM materials").get().n,
    1,
  );
  assert.equal(
    f.storage.database.prepare("SELECT COUNT(*) AS n FROM jobs").get().n,
    0,
  );
  const restarted = createSales(f.options);
  assert.equal(restarted.quotes.detail(member, cmd.id).quote.version, 2);
  assert.equal(
    f.storage.database.prepare("PRAGMA foreign_key_check").all().length,
    0,
  );
});
test("quote retries are actor-bound and exact; stale or changed commands cannot create revisions", (t) => {
  const f = fixture(t),
    cmd = f.command(),
    result = f.quotes.save(member, cmd);
  assert.deepEqual(f.quotes.save(member, cmd), result);
  assert.throws(
    () => f.quotes.save(owner, cmd),
    (e) => e.status === 403,
  );
  assert.throws(
    () =>
      f.quotes.save(member, {
        ...cmd,
        document: { ...cmd.document, title: "Different content" },
      }),
    (e) => e.status === 409,
  );
  assert.throws(
    () => f.quotes.save(member, { ...cmd, requestKey: randomUUID() }),
    (e) => e.status === 409,
  );
  assert.equal(
    f.storage.database
      .prepare("SELECT COUNT(*) AS n FROM _sales_quote_revisions")
      .get().n,
    1,
  );
});
test("quote pricing guards and failed journal writes roll back heads, revisions and lines", (t) => {
  const f = fixture(t),
    db = f.storage.database,
    cmd = f.command();
  assert.throws(
    () =>
      f.quotes.save(member, {
        ...cmd,
        estimate: { ...cmd.estimate, expectedProfileVersion: 99 },
      }),
    (e) => e.status === 409,
  );
  assert.throws(
    () =>
      f.quotes.save(member, {
        ...cmd,
        estimate: { ...cmd.estimate, expectedOpportunityVersion: 99 },
      }),
    (e) => e.status === 409,
  );
  f.setCost(1500);
  assert.throws(
    () => f.quotes.save(member, cmd),
    (e) => e.status === 409,
  );
  f.setCost(1200);
  db.exec(
    "CREATE TRIGGER reject_quote_ack BEFORE INSERT ON _sales_quote_requests BEGIN SELECT RAISE(ABORT,'fixture failure'); END;",
  );
  assert.throws(() => f.quotes.save(member, cmd), /fixture failure/);
  for (const table of [
    "_sales_quotes",
    "_sales_quote_revisions",
    "_sales_quote_revision_lines",
    "_sales_quote_requests",
  ])
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0);
  db.exec("DROP TRIGGER reject_quote_ack");
  assert.equal(f.quotes.save(member, cmd).quote.number, 1);
});
test("quote history and request evidence reject mutation; current ownership gates read and replay", (t) => {
  const f = fixture(t),
    db = f.storage.database,
    cmd = f.command();
  f.quotes.save(member, cmd);
  for (const table of [
    "_sales_quote_revisions",
    "_sales_quote_revision_lines",
    "_sales_quote_requests",
  ]) {
    assert.throws(() => db.exec(`DELETE FROM ${table}`), /QUOTE_IMMUTABLE/);
  }
  assert.throws(
    () => db.exec("UPDATE _sales_quote_revisions SET actor_id='changed'"),
    /QUOTE_IMMUTABLE/,
  );
  assert.throws(
    () => f.quotes.detail(viewer, cmd.id),
    (e) => e.status === 403,
  );
  assert.throws(
    () => f.quotes.detail(other, cmd.id),
    (e) => e.status === 403,
  );
  assert.equal(f.quotes.list(other).total, 0);
  assert.equal(f.quotes.list(owner).total, 1);
  db.prepare("UPDATE _sales_opportunities SET owner_id=? WHERE id=?").run(
    other.id,
    f.opportunity.id,
  );
  assert.throws(
    () => f.quotes.save(member, cmd),
    (e) => e.status === 403,
  );
  assert.throws(
    () => f.quotes.detail(member, cmd.id),
    (e) => e.status === 403,
  );
  assert.equal(f.quotes.detail(other, cmd.id).quote.id, cmd.id);
});
test("quote inputs, history pagination and opportunity binding reject invalid requests", (t) => {
  const f = fixture(t),
    cmd = f.command();
  assert.throws(
    () =>
      f.quotes.save(member, {
        ...cmd,
        document: { ...cmd.document, validUntil: "2026-02-30" },
      }),
    (e) => e.status === 400,
  );
  assert.throws(
    () =>
      f.quotes.save(member, {
        ...cmd,
        document: { ...cmd.document, validUntil: "2026-11-01" },
      }),
    (e) => e.status === 400,
  );
  assert.throws(
    () => f.quotes.save(member, { ...cmd, unexpected: true }),
    (e) => e.status === 400,
  );
  f.quotes.save(member, cmd);
  assert.throws(
    () => f.quotes.detail(member, cmd.id, { historyPage: "0" }),
    (e) => e.status === 400,
  );
  assert.throws(
    () => f.quotes.detail(member, cmd.id, { revision: "999" }),
    (e) => e.status === 404,
  );
  assert.throws(
    () => f.quotes.list(member, { page: "Infinity" }),
    (e) => e.status === 400,
  );
  assert.throws(
    () => f.quotes.list(member, { opportunityId: "bad" }),
    (e) => e.status === 400,
  );
  const another = f.service.saveOpportunity(member, null, {
    title: "Different bid",
    pipelineId: f.opportunity.pipeline_id,
    stageId: f.opportunity.stage_id,
    ownerId: member.id,
    prospectName: "Another prospect",
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
  assert.throws(
    () =>
      f.quotes.save(member, {
        ...cmd,
        requestKey: randomUUID(),
        expectedVersion: 1,
        estimate: {
          ...cmd.estimate,
          opportunityId: another.id,
          expectedOpportunityVersion: another.version,
        },
      }),
    (e) => e.status === 409,
  );
  f.storage.database
    .prepare("UPDATE _sales_quotes SET status='offered' WHERE id=?")
    .run(cmd.id);
  assert.throws(
    () =>
      f.quotes.save(member, {
        ...cmd,
        requestKey: randomUUID(),
        expectedVersion: 1,
      }),
    (e) => e.status === 409,
  );
  f.storage.database
    .prepare("UPDATE _sales_quotes SET status='draft' WHERE id=?")
    .run(cmd.id);
  const closed = f.service;
  const pipeline = closed.pipeline(f.opportunity.pipeline_id);
  const lost = pipeline.stages.find((s) => s.kind === "lost");
  closed.move(member, f.opportunity.id, {
    stageId: lost.id,
    expectedVersion: f.opportunity.version,
    reason: "Fixture was not selected",
  });
  assert.throws(
    () =>
      f.quotes.save(member, {
        ...cmd,
        requestKey: randomUUID(),
        expectedVersion: 1,
      }),
    (e) => e.status === 409,
  );
});
test("quote HTTP boundaries recheck the actor after streamed bodies and enforce body limits", async (t) => {
  const f = fixture(t),
    cmd = f.command();
  const request = (path, init = {}) => f.app.request("/" + path, init);
  const headers = {
    "Content-Type": "application/json",
    "X-Requested-With": "OpenFieldService",
  };
  f.setActor(viewer);
  assert.equal((await request("quotes")).status, 403);
  f.setActor(member);
  assert.equal(
    (
      await request("quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cmd),
      })
    ).status,
    403,
  );
  const revoked = new ReadableStream({
    pull(controller) {
      f.setActor(viewer);
      controller.enqueue(new TextEncoder().encode(JSON.stringify(cmd)));
      controller.close();
    },
  });
  assert.equal(
    (
      await request("quotes", {
        method: "POST",
        headers,
        body: revoked,
        duplex: "half",
      })
    ).status,
    403,
  );
  f.setActor(member);
  const response = await request("quotes", {
    method: "POST",
    headers,
    body: JSON.stringify(cmd),
  });
  assert.equal(response.status, 200);
  const read = await request("quotes/" + cmd.id);
  assert.equal(read.status, 200);
  assert.equal((await read.json()).quote.id, cmd.id);
  const large = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(" ".repeat(60000)));
      controller.close();
    },
  });
  assert.equal(
    (
      await request("quotes", {
        method: "POST",
        headers,
        body: large,
        duplex: "half",
      })
    ).status,
    413,
  );
  assert.equal(
    f.storage.database.prepare("SELECT COUNT(*) AS n FROM _sales_quotes").get()
      .n,
    1,
  );
});
test("workbench lookups stay bounded, permission checked, native and searchable", async (t) => {
  const f = fixture(t);
  assert.equal(
    f.quotes.options(member, { kind: "opportunities" }).rows[0].id,
    f.opportunity.id,
  );
  assert.equal(f.quotes.options(other, { kind: "opportunities" }).total, 0);
  assert.equal(
    f.quotes.options(owner, { kind: "opportunities", search: "Native bid" })
      .total,
    1,
  );
  assert.equal(
    f.quotes.options(owner, { kind: "opportunities", search: "no match" })
      .total,
    0,
  );
  assert.throws(
    () => f.quotes.options(viewer, { kind: "opportunities" }),
    (e) => e.status === 403,
  );
  assert.throws(
    () =>
      f.quotes.options(other, {
        kind: "materials",
        opportunityId: f.opportunity.id,
      }),
    (e) => e.status === 403,
  );
  assert.throws(
    () =>
      f.quotes.options(member, {
        kind: "materials",
        opportunityId: f.opportunity.id,
        materialId: "bad",
      }),
    (e) => e.status === 400,
  );
  f.setCost(1775);
  const materials = f.quotes.options(member, {
    kind: "materials",
    opportunityId: f.opportunity.id,
    materialId: f.materialId,
  });
  assert.equal(materials.total, 1);
  assert.equal(materials.rows[0].id, f.materialId);
  assert.equal(materials.rows[0].unitCostCents, 1775);
  assert.equal(
    f.quotes.options(member, {
      kind: "materials",
      opportunityId: f.opportunity.id,
      page: 2,
    }).rows.length,
    0,
  );
  assert.equal(
    f.billingProfiles.list(member, { search: "Fixture", segment: "commercial" })
      .profiles.length,
    1,
  );
  assert.equal(
    f.billingProfiles.list(member, { segment: "residential" }).profiles.length,
    0,
  );
  assert.throws(
    () => f.billingProfiles.get(viewer, f.profile.id),
    (e) => e.status === 403,
  );
  assert.equal(
    f.billingProfiles.get(member, f.profile.id).profile.version,
    f.profile.version,
  );
  const response = await f.app.request("/quotes/options?kind=opportunities");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).rows[0].id, f.opportunity.id);
});

test("workbench line serialization saves exact decimal input through the quote API contract", async (t) => {
  const f = fixture(t),
    cmd = f.command();
  const draft = editLine(cmd.estimate.lines[0]);
  assert.deepEqual(lineInput(draft), cmd.estimate.lines[0]);
  draft.quantity = "2.125";
  cmd.estimate.lines = [lineInput(draft)];
  const response = await f.app.request("/quotes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "OpenFieldService",
    },
    body: JSON.stringify(cmd),
  });
  assert.equal(response.status, 200);
  const { quote } = await response.json();
  assert.equal(quote.estimate.lines[0].materialId, f.materialId);
  assert.equal(quote.estimate.lines[0].quantityMilli, 2125);
  assert.equal(quote.estimate.costCents, 2550);
  assert.equal(quote.estimate.totalCents, 4463);
  assert.deepEqual(
    lineInput(editLine(quote.estimate.lines[0])),
    cmd.estimate.lines[0],
  );
});
