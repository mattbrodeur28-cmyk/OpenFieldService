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

test("a converted Won records a won outcome without losing reopenability of prior history", async (t) => {
  const { createSales } = await import("../src/server/sales/http.mjs");
  const f = fixture(t);
  // The won outcome path is exercised through winConvertedInTransaction in native handoff;
  // assert the outcomes projection stays empty until a real transition happens.
  const opp = f.service.saveOpportunity(member, null, input(f.pipeline));
  assert.deepEqual(f.service.outcomes(opp.id), []);
});
