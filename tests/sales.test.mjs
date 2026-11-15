import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openStorage } from "../src/server/sqlite.mjs";
import { createSalesService } from "../src/server/sales/service.mjs";
import { createSales } from "../src/server/sales/http.mjs";
import { migrate } from "../src/server/platform/sqlite.mjs";
const owner = { id: "owner", name: "Owner", role: "owner", active: true },
  member = { id: "member", name: "Sales member", role: "member", active: true },
  other = { id: "other", name: "Another member", role: "member", active: true },
  viewer = { id: "viewer", role: "viewer", active: true };
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "ofs-sales-")),
    filename = join(dir, "service.sqlite"),
    storage = openStorage(filename);
  t.after(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const options = { storage, owners: () => [owner, member, other] },
    service = createSalesService(options),
    pipeline = service.pipelines()[0];
  return { dir, filename, storage, options, service, pipeline };
}
function input(pipeline, user = owner, extra = {}) {
  return {
    title: "Controls retrofit",
    pipelineId: pipeline.id,
    stageId: pipeline.stages[0].id,
    ownerId: user.id,
    prospectName: "Commercial prospect",
    contactName: "Facilities manager",
    contactEmail: "fm@example.test",
    contactPhone: "555-0100",
    segment: "commercial",
    source: "Referral",
    expectedValue: 1250000,
    probability: 10,
    expectedCloseDate: "2026-12-15",
    nextAction: "Schedule site visit",
    nextActionDate: "2026-11-20",
    customerId: null,
    siteId: null,
    assetId: null,
    notes: "Internal scope notes",
    ...extra,
  };
}
function config(pipeline, extra = {}) {
  return {
    name: pipeline.name,
    expectedVersion: pipeline.version,
    stages: pipeline.stages.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      probability: s.probability,
      requiredFields: s.requiredFields,
      allowedFrom: s.allowedFrom,
    })),
    ...extra,
  };
}

test("Sales preserves prospect history, enforces stage rules, snapshots versions and keeps forecast separate from revenue", (t) => {
  const { service, pipeline, storage, filename } = fixture(t),
    db = storage.database;
  const opportunity = service.saveOpportunity(
    member,
    null,
    input(pipeline, member),
  );
  assert.equal(opportunity.expected_value, 1250000);
  assert.throws(
    () =>
      service.saveOpportunity(
        other,
        opportunity.id,
        input(pipeline, other, { expectedVersion: 0 }),
      ),
    /Only the opportunity owner/,
  );
  assert.throws(
    () => service.saveOpportunity(member, null, input(pipeline, owner)),
    /own opportunities/,
  );
  assert.throws(
    () => service.saveOpportunity(viewer, null, input(pipeline, viewer)),
    /cannot change/,
  );
  const qualified = pipeline.stages[1],
    won = pipeline.stages.find((s) => s.kind === "won"),
    lost = pipeline.stages.find((s) => s.kind === "lost");
  const moved = service.move(member, opportunity.id, {
    stageId: qualified.id,
    expectedVersion: 0,
  });
  assert.equal(moved.version, 1);
  assert.equal(moved.probability, 25);
  assert.throws(
    () =>
      service.move(member, opportunity.id, {
        stageId: pipeline.stages[2].id,
        expectedVersion: 0,
      }),
    /changed/,
  );
  assert.throws(
    () =>
      service.move(member, opportunity.id, {
        stageId: won.id,
        expectedVersion: 1,
      }),
    /reserved/,
  );
  assert.throws(
    () =>
      service.move(member, opportunity.id, {
        stageId: lost.id,
        expectedVersion: 1,
      }),
    /loss reason/,
  );
  const closed = service.move(member, opportunity.id, {
    stageId: lost.id,
    expectedVersion: 1,
    reason: "Budget postponed",
  });
  assert.equal(closed.version, 2);
  assert.throws(
    () =>
      service.move(member, opportunity.id, {
        stageId: qualified.id,
        expectedVersion: 2,
        reason: "Funding approved",
      }),
    /administrator/,
  );
  assert.throws(
    () =>
      service.saveOpportunity(
        owner,
        opportunity.id,
        input(pipeline, member, { stageId: lost.id, expectedVersion: 2 }),
      ),
    /reopened/,
  );
  const reopened = service.move(owner, opportunity.id, {
    stageId: qualified.id,
    expectedVersion: 2,
    reason: "Funding approved",
  });
  assert.equal(reopened.version, 3);
  service.note(member, opportunity.id, {
    content: "Confirmed site survey with the customer.",
    expectedVersion: 3,
  });
  const detail = service.detail(opportunity.id);
  assert.equal(detail.notes[0].actor_id, "member");
  assert.ok(
    detail.activity.some(
      (item) => item.action === "reopen" && item.reason === "Funding approved",
    ),
  );
  const board = service.list({ pipelineId: pipeline.id });
  assert.equal(board.total, 1);
  assert.equal(board.totals[0].value, 1250000);
  assert.equal(board.totals[0].weightedHundredths, 31250000);
  assert.equal(board.currency, "USD");
  assert.equal(
    service.list({
      pipelineId: pipeline.id,
      minValue: "1250000",
      maxValue: "1250000",
    }).total,
    1,
  );
  assert.equal(
    service.list({ pipelineId: pipeline.id, minValue: "1250001" }).total,
    0,
  );
  assert.throws(
    () => service.list({ pipelineId: pipeline.id, minValue: "1.5" }),
    /whole cents/,
  );
  assert.throws(
    () =>
      service.list({ pipelineId: pipeline.id, minValue: "10", maxValue: "5" }),
    /reversed/,
  );

  assert.equal(
    service.list({
      pipelineId: pipeline.id,
      search: "site visit",
      ownerId: "member",
      closeFrom: "2026-12-01",
      closeTo: "2026-12-31",
    }).total,
    1,
  );
  assert.equal(
    service.list({ pipelineId: pipeline.id, closeTo: "2026-11-01" }).total,
    0,
  );
  assert.throws(
    () => service.list({ pipelineId: pipeline.id, closeFrom: "2026-02-30" }),
    /valid calendar/,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM jobs").get().n,
    0,
    "pipeline work does not invent active jobs or recognized revenue",
  );
  const restarted = openStorage(filename);
  try {
    const resumed = createSalesService({
      storage: restarted,
      owners: () => [owner, member],
    });
    assert.equal(resumed.detail(opportunity.id).opportunity.version, 4);
    assert.equal(resumed.pipelines().length, 1);
  } finally {
    restarted.close();
  }
});

test("Sales pipeline configuration preserves occupied stages and validates transitions, relationships and money", (t) => {
  const { service, pipeline, storage } = fixture(t),
    db = storage.database;
  const customer = randomUUID(),
    foreign = randomUUID(),
    site = randomUUID(),
    asset = randomUUID();
  db.prepare("INSERT INTO customers(id,name) VALUES(?,?)").run(
    customer,
    "Commercial customer",
  );
  db.prepare("INSERT INTO customers(id,name) VALUES(?,?)").run(
    foreign,
    "Other customer",
  );
  db.prepare("INSERT INTO sites(id,customer_id,name) VALUES(?,?,?)").run(
    site,
    customer,
    "Office",
  );
  db.prepare(
    "INSERT INTO assets(id,customer_id,site_id,name,serial_number) VALUES(?,?,?,?,?)",
  ).run(asset, customer, site, "AHU-1", "SALES-SN");
  assert.throws(
    () =>
      service.saveOpportunity(
        owner,
        null,
        input(pipeline, owner, { expectedValue: 0.1 }),
      ),
    /integer/,
  );
  assert.throws(
    () =>
      service.saveOpportunity(
        owner,
        null,
        input(pipeline, owner, { customerId: foreign, siteId: site }),
      ),
    /Site must belong/,
  );
  assert.throws(
    () =>
      service.saveOpportunity(
        owner,
        null,
        input(pipeline, owner, { customerId: foreign, assetId: asset }),
      ),
    /Equipment must belong/,
  );
  const row = service.saveOpportunity(
    owner,
    null,
    input(pipeline, owner, {
      customerId: customer,
      siteId: site,
      assetId: asset,
    }),
  );
  assert.throws(
    () => db.prepare("DELETE FROM customers WHERE id=?").run(customer),
    /FOREIGN KEY/,
  );
  assert.throws(
    () => service.savePipeline(member, pipeline.id, config(pipeline)),
    /administrator/,
  );
  const revised = config(pipeline);
  revised.stages[1].requiredFields = ["customerId"];
  revised.stages[2].allowedFrom = [pipeline.stages[1].id];
  const newPipeline = service.savePipeline(owner, pipeline.id, revised);
  assert.equal(newPipeline.version, 1);
  assert.throws(
    () => service.savePipeline(owner, pipeline.id, revised),
    /changed/,
  );
  assert.throws(
    () =>
      service.savePipeline(
        owner,
        pipeline.id,
        config(newPipeline, {
          stages: newPipeline.stages.slice(1).map((s) => ({
            id: s.id,
            name: s.name,
            kind: s.kind,
            probability: s.probability,
            requiredFields: s.requiredFields,
            allowedFrom: [],
          })),
        }),
      ),
    /Move opportunities/,
  );
  assert.throws(
    () =>
      service.move(owner, row.id, {
        stageId: pipeline.stages[2].id,
        expectedVersion: 0,
      }),
    /not allowed/,
  );
  const prospect = service.saveOpportunity(owner, null, input(newPipeline));
  assert.throws(
    () =>
      service.move(owner, prospect.id, {
        stageId: pipeline.stages[1].id,
        expectedVersion: 0,
      }),
    /requires customerId/,
  );
  const moved = service.move(owner, row.id, {
    stageId: pipeline.stages[1].id,
    expectedVersion: 0,
  });
  assert.equal(moved.stage_name, "Qualified");
  assert.throws(
    () =>
      service.saveOpportunity(
        owner,
        row.id,
        input(pipeline, owner, {
          customerId: customer,
          siteId: site,
          assetId: asset,
          stageId: pipeline.stages[2].id,
          expectedVersion: 1,
        }),
      ),
    /Use Move stage/,
  );
  assert.deepEqual(
    service.options({ customerId: customer }).assets.map((a) => a.id),
    [asset],
  );
  const second = service.savePipeline(owner, null, {
    name: "Residential",
    stages: [
      {
        name: "New",
        kind: "open",
        probability: 20,
        requiredFields: [],
        allowedFrom: [],
      },
      {
        name: "Won",
        kind: "won",
        probability: 100,
        requiredFields: [],
        allowedFrom: [],
      },
      {
        name: "Lost",
        kind: "lost",
        probability: 0,
        requiredFields: [],
        allowedFrom: [],
      },
    ],
  });
  assert.throws(
    () =>
      service.move(owner, row.id, {
        stageId: second.stages[0].id,
        expectedVersion: 1,
      }),
    /this pipeline/,
  );
});

test("Sales serializes competing edits from independent connections and rolls back incomplete pipeline changes", (t) => {
  const { service, pipeline, filename, storage } = fixture(t),
    second = openStorage(filename);
  t.after(() => second.close());
  const otherService = createSalesService({
    storage: second,
    owners: () => [owner, member],
  });
  const row = service.saveOpportunity(owner, null, input(pipeline));
  service.move(owner, row.id, {
    stageId: pipeline.stages[1].id,
    expectedVersion: 0,
  });
  assert.throws(
    () =>
      otherService.move(owner, row.id, {
        stageId: pipeline.stages[2].id,
        expectedVersion: 0,
      }),
    /changed/,
  );
  assert.equal(
    otherService.detail(row.id).opportunity.stage_id,
    pipeline.stages[1].id,
  );
  const count = storage.database
    .prepare("SELECT COUNT(*) AS n FROM _sales_audit")
    .get().n;
  const bad = config(pipeline);
  bad.stages[0].allowedFrom = [randomUUID()];
  assert.throws(
    () => service.savePipeline(owner, pipeline.id, bad),
    /Allowed source/,
  );
  assert.equal(
    storage.database.prepare("SELECT COUNT(*) AS n FROM _sales_audit").get().n,
    count,
  );
  assert.equal(service.pipeline(pipeline.id).version, 0);
});

test("Sales HTTP requires sessions and write headers, bounds input and rechecks mutation permissions", async (t) => {
  const { options, pipeline } = fixture(t);
  let user = owner;
  const { app } = createSales({ ...options, currentUser: () => user });
  const request = (path, method = "GET", body, headers = {}) =>
    app.request(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "OpenFieldService",
        ...headers,
      },
      ...(body !== undefined
        ? { body: typeof body === "string" ? body : JSON.stringify(body) }
        : {}),
    });
  user = null;
  assert.equal((await request("/pipelines")).status, 401);
  user = viewer;
  assert.equal((await request("/pipelines")).status, 200);
  assert.equal(
    (await request("/opportunities", "POST", input(pipeline))).status,
    403,
  );
  user = owner;
  assert.equal(
    (
      await request("/opportunities", "POST", input(pipeline), {
        "X-Requested-With": "",
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("/opportunities", "POST", "bad json")).status,
    400,
  );
  assert.equal((await request("/opportunities")).status, 400);
  assert.equal(
    (
      await request("/opportunities", "POST", {
        ...input(pipeline),
        ownerId: "inactive",
      })
    ).status,
    400,
  );
  const created = await request("/opportunities", "POST", input(pipeline));
  assert.equal(created.status, 201);
  const { opportunity } = await created.json();
  assert.equal(
    (
      await request("/opportunities/" + opportunity.id + "/stage", "PUT", {
        stageId: pipeline.stages[1].id,
        expectedVersion: 0,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/opportunities/" + opportunity.id + "/stage", "PUT", {
        stageId: pipeline.stages[2].id,
        expectedVersion: 0,
      })
    ).status,
    409,
  );
  user = { ...owner, mustChangePassword: true };
  assert.equal((await request("/pipelines")).status, 403);
});

test("Module migrations reject checksum drift and newer schemas while preserving existing records", (t) => {
  const { storage } = fixture(t),
    db = storage.database;
  const steps = [
    {
      version: 1,
      sql: "CREATE TABLE _migration_test(value TEXT); INSERT INTO _migration_test VALUES('Keep me');",
    },
  ];
  migrate(db, "_test_schema_migrations", steps);
  migrate(db, "_test_schema_migrations", steps);
  assert.throws(
    () =>
      migrate(db, "_test_schema_migrations", [
        { version: 1, sql: "DROP TABLE _migration_test;" },
      ]),
    /checksum/,
  );
  assert.throws(() => migrate(db, "_test_schema_migrations", []), /newer/);
  assert.equal(
    db.prepare("SELECT value FROM _migration_test").get().value,
    "Keep me",
  );
});

test("Sales rechecks current permissions after an asynchronous request body", async (t) => {
  const { options, pipeline } = fixture(t);
  let actor = owner;
  const { app } = createSales({ ...options, currentUser: () => actor });
  let release;
  const pending = new ReadableStream({
    start(controller) {
      release = () => {
        controller.enqueue(
          new TextEncoder().encode(JSON.stringify(input(pipeline))),
        );
        controller.close();
      };
    },
  });
  const response = app.request(
    new Request("http://localhost/opportunities", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "OpenFieldService",
      },
      body: pending,
      duplex: "half",
    }),
  );
  actor = viewer;
  release();
  assert.equal((await response).status, 403);
});
