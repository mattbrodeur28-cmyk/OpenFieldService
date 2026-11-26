import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStorage } from "../src/server/sqlite.mjs";
import { createSalesService } from "../src/server/sales/service.mjs";

// SALES-010: won/lost reasons, competitor retention, reopen history and nurture tasks.
const owner = { id: "owner", role: "owner", active: true },
  member = { id: "member", role: "member", active: true },
  other = { id: "other", role: "member", active: true };
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "ofs-sales-outcomes-")),
    storage = openStorage(join(dir, "s.sqlite")),
    service = createSalesService({ storage, owners: () => [owner, member, other] }),
    pipeline = service.pipelines()[0];
  t.after(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { storage, service, pipeline, db: storage.database };
}
function input(pipeline, extra = {}) {
  return {
    title: "Controls retrofit",
    pipelineId: pipeline.id,
    stageId: pipeline.stages[0].id,
    ownerId: member.id,
    prospectName: "Commercial prospect",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    segment: "commercial",
    source: "",
    expectedValue: 1250000,
    probability: 10,
    expectedCloseDate: "",
    nextAction: "",
    nextActionDate: "",
    customerId: null,
    siteId: null,
    assetId: null,
    notes: "",
    ...extra,
  };
}

test("loss requires a reason, retains the competitor and creates a nurture follow-up", (t) => {
  const f = fixture(t);
  const opp = f.service.saveOpportunity(member, null, input(f.pipeline));
  const lost = f.pipeline.stages.find((s) => s.kind === "lost");
  assert.throws(
    () => f.service.move(member, opp.id, { stageId: lost.id, expectedVersion: 0 }),
    /loss reason/,
  );
  f.service.move(member, opp.id, {
    stageId: lost.id,
    expectedVersion: 0,
    reason: "Lost to incumbent",
    competitor: "Rival HVAC",
    nurtureDueAt: "2026-12-01T09:00:00Z",
  });
  const outcomes = f.service.outcomes(opp.id);
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].kind, "lost");
  assert.equal(outcomes[0].competitor, "Rival HVAC");
  assert.equal(outcomes[0].reason, "Lost to incumbent");
  const activity = f.db
    .prepare("SELECT kind,title,assignee_id,status,due_at FROM _sales_activities WHERE opportunity_id=?")
    .get(opp.id);
  assert.equal(activity.kind, "task");
  assert.match(activity.title, /Nurture/);
  assert.equal(activity.assignee_id, member.id);
  assert.equal(activity.status, "open");
  assert.equal(activity.due_at, "2026-12-01T09:00:00.000Z");
});

test("reopen records history, requires an administrator and keeps outcomes immutable", (t) => {
  const f = fixture(t);
  const opp = f.service.saveOpportunity(member, null, input(f.pipeline));
  const lost = f.pipeline.stages.find((s) => s.kind === "lost");
  f.service.move(member, opp.id, {
    stageId: lost.id,
    expectedVersion: 0,
    reason: "Lost",
    competitor: "Rival",
  });
  assert.throws(
    () =>
      f.service.move(member, opp.id, {
        stageId: f.pipeline.stages[0].id,
        expectedVersion: 1,
      }),
    /administrator/,
  );
  f.service.move(owner, opp.id, {
    stageId: f.pipeline.stages[0].id,
    expectedVersion: 1,
    reason: "Customer reconsidered",
  });
  assert.deepEqual(
    f.service.outcomes(opp.id).map((o) => o.kind),
    ["lost", "reopen"],
  );
  assert.equal(f.service.outcomes(opp.id)[0].competitor, "Rival");
  assert.throws(
    () => f.db.exec("UPDATE _sales_stage_outcomes SET competitor='changed'"),
    /IMMUTABLE/,
  );
  assert.throws(() => f.db.exec("DELETE FROM _sales_stage_outcomes"), /IMMUTABLE/);
});

test("forecast sums weighted and unweighted stage amounts with explicit definitions", (t) => {
  const f = fixture(t);
  f.service.saveOpportunity(member, null, input(f.pipeline, { expectedValue: 100000, probability: 50 }));
  const b = f.service.saveOpportunity(member, null, input(f.pipeline, { expectedValue: 200000, probability: 50 }));
  const lost = f.pipeline.stages.find((s) => s.kind === "lost");
  f.service.move(member, b.id, { stageId: lost.id, expectedVersion: 0, reason: "Lost bid" });
  const forecast = f.service.forecast();
  const byName = Object.fromEntries(forecast.stages.map((s) => [s.name, s]));
  assert.equal(byName.New.count, 1);
  assert.equal(byName.New.value, 100000);
  assert.equal(byName.New.weighted, 50000);
  assert.equal(byName.Lost.count, 1);
  assert.equal(byName.Lost.value, 200000);
  assert.equal(byName.Lost.weighted, 0);
  assert.deepEqual(forecast.totals.open, { count: 1, value: 100000, weighted: 50000 });
  assert.deepEqual(forecast.totals.lost, { count: 1, value: 200000, weighted: 0 });
  assert.equal(forecast.quoteAcceptance, null);
  assert.equal(forecast.conversions, null);
  assert.ok(forecast.definitions.weighted.length > 0);
});

test("stage durations aggregate completed time-in-stage from the audit trail", (t) => {
  const f = fixture(t);
  const opp = f.service.saveOpportunity(member, null, input(f.pipeline, { title: "Duration opp" }));
  const qualified = f.pipeline.stages[1];
  const lost = f.pipeline.stages.find((s) => s.kind === "lost");
  f.service.move(member, opp.id, { stageId: qualified.id, expectedVersion: 0, reason: "Qualified" });
  f.service.move(member, opp.id, { stageId: lost.id, expectedVersion: 1, reason: "Lost", competitor: "Rival" });
  const durations = f.service.stageDurations();
  const newStage = durations.stages.find((s) => s.stageName === "New");
  const qualifiedStage = durations.stages.find((s) => s.stageName === "Qualified");
  assert.ok(newStage);
  assert.equal(newStage.count, 1);
  assert.equal(newStage.stageKind, "open");
  assert.ok(qualifiedStage);
  assert.equal(qualifiedStage.count, 1);
  assert.equal(durations.stages.find((s) => s.stageKind === "lost"), undefined);
});

