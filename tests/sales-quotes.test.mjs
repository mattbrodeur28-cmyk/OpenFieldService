import { customerQuoteDocument } from "../src/server/sales/quote-document.mjs";
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

test("customer document allowlists saved pricing and terms, escapes HTML and never changes business state", async t => {
  const f = fixture(t), cmd = f.command(), db = f.storage.database;
  const customer = randomUUID(), site = randomUUID(), asset = randomUUID();
  db.prepare("INSERT INTO customers(id,name,address,city,state,zip,notes) VALUES(?,?,?,?,?,?,?)")
    .run(customer, 'Customer <script>alert("name")</script>', "1 Native Street", "Boston", "MA", "02101", "SECRET_CRM_NOTE");
  db.prepare("INSERT INTO sites(id,customer_id,name,address,safety_notes,access_instructions) VALUES(?,?,?,?,?,?)")
    .run(site, customer, "Native location", "2 Site Avenue", "SECRET_SITE_SAFETY", "SECRET_SITE_ACCESS");
  db.prepare("INSERT INTO assets(id,customer_id,site_id,name,serial_number,manufacturer,model,notes) VALUES(?,?,?,?,?,?,?,?)")
    .run(asset, customer, site, "Native equipment", "SERIAL-1", "Fixture manufacturer", "Model 1", "SECRET_ASSET_NOTE");
  db.prepare("UPDATE _sales_opportunities SET customer_id=?,site_id=?,asset_id=?,notes=? WHERE id=?")
    .run(customer, site, asset, "SECRET_OPPORTUNITY_NOTE", f.opportunity.id);
  cmd.document.scope = 'Check <img src=x onerror="alert(1)"> & verify <script>alert(2)</script>.';
  cmd.document.exclusions = '</style><svg onload="alert(3)">';
  cmd.estimate.lines[0].costOverrideReason = "SECRET_COST_REASON";
  f.quotes.save(member, cmd);
  const counts = () => Object.fromEntries(["customers","sites","assets","materials","jobs","_sales_quotes","_sales_quote_revisions","_sales_quote_requests"]
    .map(table => [table, db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n]));
  const before = counts();
  const response = await f.app.request(`/quotes/${cmd.id}/document?revision=1`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const {document: doc} = await response.json();
  assert.equal(doc.kind,"draft_review");
  assert.equal(doc.identityBasis,"current_native_records");
  assert.equal(doc.scope,cmd.document.scope);
  assert.equal(doc.customer.name,'Customer <script>alert("name")</script>');
  assert.deepEqual(doc.site,{name:"Native location",address:"2 Site Avenue"});
  assert.equal(doc.equipment.serialNumber,"SERIAL-1");
  assert.equal(doc.lines[0].unitSellCents,2000);
  assert.equal(doc.lines[0].taxCents,250);
  assert.equal(doc.totalCents,5250);
  const forbidden = new Set(["unitCostCents","costCents","profitCents","marginBasisPoints","markupBasisPoints","materialSnapshots","profile","profileId","profileVersion","reviewNote","note","notes","actorId","requestKey","sourceVersion","costOverrideReason","travelGroup","materialId","ownerId"]);
  const inspect = value => {
    if (!value || typeof value !== "object") return;
    for (const [key,item] of Object.entries(value)) { assert.ok(!forbidden.has(key),`Leaked internal field ${key}`); inspect(item); }
  };
  inspect(doc);
  assert.doesNotMatch(JSON.stringify(doc), /SECRET_/);
  const download = await f.app.request(`/quotes/${cmd.id}/document.html?revision=1`);
  assert.equal(download.status,200);
  assert.equal(download.headers.get("content-disposition"),'attachment; filename="Q-000001-r1-draft.html"');
  assert.match(download.headers.get("content-type"),/^text\/html/);
  assert.match(download.headers.get("content-security-policy"),/sandbox; default-src 'none'/);
  assert.equal(download.headers.get("x-content-type-options"),"nosniff");
  assert.equal(download.headers.get("cache-control"),"private, no-store");
  const html = await download.text();
  assert.match(html,/DRAFT · INTERNAL REVIEW COPY/);
  assert.match(html,/\$52\.50/);
  assert.match(html,/&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html,/&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
  assert.match(html,/&lt;\/style&gt;&lt;svg onload=&quot;alert\(3\)&quot;&gt;/);
  assert.doesNotMatch(html,/<script|<img|<svg|SECRET_|costOverrideReason|marginBasisPoints|Fixture configuration/);
  assert.deepEqual(counts(),before);
  assert.equal(f.quotes.detail(member,cmd.id).quote.status,"draft");
});

test("customer document preserves selected revision and inclusive tax while identifying current native relationships", async t => {
  const f = fixture(t), cmd = f.command(), db = f.storage.database;
  const inclusive = f.billingProfiles.save(owner, {
    id:f.profile.id,requestKey:randomUUID(),expectedVersion:1,
    config:{...f.profile.config,rules:f.profile.config.rules.map(rule=>({...rule,treatment:"inclusive"}))},
  }).profile;
  cmd.estimate.expectedProfileVersion = inclusive.version;
  f.quotes.save(member,cmd);
  f.quotes.save(member,{
    ...cmd,requestKey:randomUUID(),expectedVersion:1,
    document:{...cmd.document,scope:"Later scope"},
    estimate:{...cmd.estimate,lines:[{...cmd.estimate.lines[0],unitSellCents:3000}]},
  });
  const customer = randomUUID(),site = randomUUID();
  db.prepare("INSERT INTO customers(id,name) VALUES(?,?)").run(customer,"New native customer");
  db.prepare("INSERT INTO sites(id,customer_id,name) VALUES(?,?,?)").run(site,customer,"New location");
  db.prepare("UPDATE _sales_opportunities SET customer_id=?,site_id=?,version=version+1 WHERE id=?").run(customer,site,f.opportunity.id);
  f.setCost(9999);
  const old = f.quotes.document(member,cmd.id,{revision:"1"}).document;
  assert.equal(old.revision,1);
  assert.equal(old.scope,cmd.document.scope);
  assert.equal(old.totalCents,5000);
  assert.equal(old.taxCents,238);
  assert.equal(old.netCents,4762);
  assert.equal(old.lines[0].taxTreatment,"inclusive");
  assert.equal(old.customer.name,"New native customer");
  assert.equal(old.site.name,"New location");
  assert.equal(old.identityBasis,"current_native_records");
  const current = f.quotes.document(member,cmd.id).document;
  assert.equal(current.revision,2);
  assert.equal(current.scope,"Later scope");
  assert.equal(current.totalCents,7500);
  const html = await (await f.app.request(`/quotes/${cmd.id}/document.html?revision=1`)).text();
  assert.match(html,/Revision 1/);
  assert.match(html,/inclusive/);
  assert.match(html,/\$50\.00/);
  assert.doesNotMatch(html,/Later scope|\$75\.00/);
});

test("document reads and HTML downloads enforce current ownership, session and revision boundaries", async t => {
  const f=fixture(t),cmd=f.command();f.quotes.save(member,cmd);
  const read = (suffix="document",query="")=>f.app.request(`/quotes/${cmd.id}/${suffix}${query}`);
  const prospect = f.quotes.document(member,cmd.id).document;
  assert.equal(prospect.customer.kind,"prospect");
  assert.equal(prospect.customer.name,"Fixture prospect");
  assert.equal(prospect.site,null);
  assert.equal(prospect.equipment,null);
  for(const actor of [viewer,other,{...member,mustChangePassword:true}]) {
    f.setActor(actor);
    assert.equal((await read()).status,403);
    assert.equal((await read("document.html")).status,403);
  }
  f.setActor({...member,active:false}); assert.equal((await read()).status,401);
  f.setActor(null); assert.equal((await read("document.html")).status,401);
  f.setActor(owner); assert.equal((await read()).status,200);
  f.setActor(member);
  for(const value of ["0","-1","1.2","abc","1000001"]) {
    assert.equal((await read("document",`?revision=${value}`)).status,400);
    assert.equal((await read("document.html",`?revision=${value}`)).status,400);
  }
  assert.equal((await read("document","?revision=2")).status,404);
  assert.equal((await f.app.request(`/quotes/${randomUUID()}/document`)).status,404);
  assert.equal((await f.app.request("/quotes/invalid/document.html")).status,400);
  f.storage.database.prepare("UPDATE _sales_opportunities SET owner_id=? WHERE id=?").run(other.id,f.opportunity.id);
  assert.equal((await read()).status,403);
  assert.equal((await read("document.html")).status,403);
  f.setActor(other);assert.equal((await read()).status,200);
});

test("document projection rejects future internal properties and does not expose foreign customer locations", t => {
  const f=fixture(t),cmd=f.command();const saved=f.quotes.save(member,cmd).quote;
  const privateValue="FUTURE_PRIVATE_VALUE";
  const poisoned={...saved,futurePrivate:privateValue,document:{...saved.document,internalTerms:privateValue},estimate:{...saved.estimate,internalPricing:privateValue,lines:saved.estimate.lines.map(line=>({...line,futurePrivate:privateValue,taxRule:{...line.taxRule,privateReviewer:privateValue}}))}};
  const doc=customerQuoteDocument(poisoned,{
    opportunity:{prospect_name:"Prospect",futurePrivate:privateValue},
    customer:{name:"Customer",address:"",city:"",state:"",zip:"",futurePrivate:privateValue},
    site:{name:"Site",address:"",futurePrivate:privateValue},
    equipment:{name:"Equipment",manufacturer:"",model:"",serial_number:"Serial",futurePrivate:privateValue},
  });
  assert.doesNotMatch(JSON.stringify(doc),/FUTURE_PRIVATE_VALUE/);
  assert.deepEqual(Object.keys(doc.lines[0]).sort(),["description","kind","quantityMilli","headcount","unitSellCents","discountBasisPoints","grossCents","discountCents","netCents","taxCents","totalCents","taxTreatment","taxRateBasisPoints"].sort());
  const db=f.storage.database, customer=randomUUID(), foreign=randomUUID(),site=randomUUID(),asset=randomUUID();
  db.prepare("INSERT INTO customers(id,name) VALUES(?,?)").run(customer,"Linked customer");
  db.prepare("INSERT INTO customers(id,name) VALUES(?,?)").run(foreign,"Foreign customer");
  db.prepare("INSERT INTO sites(id,customer_id,name) VALUES(?,?,?)").run(site,foreign,"FOREIGN_SITE_SECRET");
  db.prepare("INSERT INTO assets(id,customer_id,site_id,name,serial_number) VALUES(?,?,?,?,?)").run(asset,foreign,site,"FOREIGN_ASSET_SECRET","Secret serial");
  // Even a legacy/inconsistent opportunity link cannot cross the native customer boundary.
  db.prepare("UPDATE _sales_opportunities SET customer_id=?,site_id=?,asset_id=? WHERE id=?").run(customer,site,asset,f.opportunity.id);
  const scoped=f.quotes.document(member,cmd.id).document;
  assert.equal(scoped.customer.name,"Linked customer");
  assert.equal(scoped.site,null);assert.equal(scoped.equipment,null);
  assert.doesNotMatch(JSON.stringify(scoped),/FOREIGN_|Secret serial/);
});
