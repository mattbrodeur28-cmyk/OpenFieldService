import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openStorage } from "../src/server/sqlite.mjs";
import { createSalesService } from "../src/server/sales/service.mjs";
import { createActivities } from "../src/server/sales/activities.mjs";
const owner = { id: "owner", role: "owner", active: true },
  member = { id: "member", role: "member", active: true },
  other = { id: "other", role: "member", active: true },
  viewer = { id: "viewer", role: "viewer", active: true };
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "ofs-followups-"));
  const filename = join(dir, "service.sqlite"),
    storage = openStorage(filename),
    owners = () => [owner, member, other],
    sales = createSalesService({ storage, owners });
  t.after(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const p = sales.pipelines()[0];
  const row = sales.saveOpportunity(member, null, {
    title: "Site survey",
    pipelineId: p.id,
    stageId: p.stages[0].id,
    ownerId: member.id,
    prospectName: "Shared customer prospect",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    segment: "commercial",
    source: "",
    expectedValue: 10000,
    probability: 10,
    expectedCloseDate: "",
    nextAction: "",
    nextActionDate: "",
    customerId: null,
    siteId: null,
    assetId: null,
    notes: "",
  });
  const messageId = randomUUID(),
    teamId = randomUUID();
  const activities = createActivities({
    storage,
    sales,
    owners,
    clock: () => new Date("2026-11-14T17:00:00Z"),
    resolveMessage: (user, id) =>
      user.id === member.id && id === messageId ? { teamId } : null,
  });
  return {
    storage,
    sales,
    row,
    activities,
    messageId,
    teamId,
    filename,
    owners,
  };
}
function input(extra = {}) {
  return {
    kind: "site_survey",
    title: "Arrange access",
    details: "Confirm access with facilities.",
    assigneeId: "member",
    dueAt: "2026-11-14T14:00:00-05:00",
    reminderAt: "2026-11-14T11:00:00-05:00",
    status: "open",
    outcome: "",
    messageId: null,
    expectedOpportunityVersion: 0,
    ...extra,
  };
}
test("Sales activities share opportunity identity, audit atomically and preserve completion authors", (t) => {
  const { storage, sales, row, activities } = fixture(t);
  const result = activities.save(member, row.id, null, input());
  assert.equal(result.opportunity.version, 1);
  assert.equal(result.activity.opportunity_id, row.id);
  assert.equal(result.activity.due_at, "2026-11-14T19:00:00.000Z");
  assert.equal(activities.reminders(member).total, 1);
  assert.equal(activities.reminders(owner).total, 0);
  assert.equal(sales.detail(row.id).activity[0].action, "activity");
  assert.throws(
    () =>
      activities.save(
        member,
        row.id,
        result.activity.id,
        input({ status: "done", expectedVersion: 0 }),
      ),
    /outcome/,
  );
  const done = activities.save(
    member,
    row.id,
    result.activity.id,
    input({
      status: "done",
      outcome: "Access confirmed with facilities.",
      expectedVersion: 0,
    }),
  );
  assert.equal(done.activity.completed_by, member.id);
  assert.equal(done.activity.completed_at, "2026-11-14T17:00:00.000Z");
  assert.equal(activities.reminders(member).total, 0);
  const reopened = activities.save(
    owner,
    row.id,
    result.activity.id,
    input({ expectedVersion: 1 }),
  );
  assert.equal(reopened.activity.completed_by, null);
  assert.equal(reopened.opportunity.version, 3);
  assert.equal(activities.list(member, { status: "all" }).total, 1);
  assert.equal(activities.list(other).total, 0);
  assert.equal(activities.list(other, { assignee: "all" }).total, 1);
  assert.equal(
    storage.database
      .prepare(
        "SELECT COUNT(*) AS n FROM _sales_audit WHERE entity_type='activity'",
      )
      .get().n,
    3,
  );
});
test("Activities enforce owner, assignee, active-user and private-message boundaries", (t) => {
  const { row, activities, messageId, teamId, storage } = fixture(t);
  for (const user of [
    viewer,
    { ...member, active: false },
    { ...member, mustChangePassword: true },
    other,
  ])
    assert.throws(
      () => activities.save(user, row.id, null, input()),
      /cannot change|Only the opportunity/,
    );
  assert.throws(
    () =>
      activities.save(member, row.id, null, input({ assigneeId: other.id })),
    /Only administrators/,
  );
  assert.throws(
    () =>
      activities.save(owner, row.id, null, input({ assigneeId: "missing" })),
    /active activity/,
  );
  assert.throws(
    () => activities.save(owner, row.id, null, input({ messageId })),
    /permitted to read/,
  );
  const saved = activities.save(member, row.id, null, input({ messageId }));
  assert.equal(saved.activity.team_id, teamId);
  assert.equal(saved.activity.message_id, messageId);
  assert.ok(!JSON.stringify(saved.activity).includes("private body"));
  const assigned = activities.save(
    owner,
    row.id,
    saved.activity.id,
    input({ expectedVersion: 0, assigneeId: other.id, messageId }),
  );
  assert.equal(assigned.activity.assignee_id, other.id);
  assert.throws(
    () =>
      activities.save(
        { ...member, hr: true },
        row.id,
        null,
        input({ expectedOpportunityVersion: 2, assigneeId: other.id }),
      ),
    /Only administrators/,
  );
  const updated = activities.save(
    other,
    row.id,
    saved.activity.id,
    input({
      expectedVersion: 1,
      assigneeId: other.id,
      messageId,
      status: "done",
      outcome: "Site survey complete",
    }),
  );
  assert.equal(updated.activity.completed_by, other.id);
  assert.throws(
    () =>
      storage.database
        .prepare("DELETE FROM _sales_opportunities WHERE id=?")
        .run(row.id),
    /FOREIGN KEY/,
  );
});
test("Competing activity edits and failed audit writes preserve the full transaction", (t) => {
  const { row, activities, storage, filename, owners } = fixture(t);
  const first = activities.save(member, row.id, null, input());
  const second = openStorage(filename);
  t.after(() => second.close());
  const otherActivities = createActivities({
    storage: second,
    sales: createSalesService({ storage: second, owners }),
    owners,
  });
  activities.save(
    member,
    row.id,
    first.activity.id,
    input({ expectedVersion: 0, title: "Confirmed survey" }),
  );
  assert.throws(
    () =>
      otherActivities.save(
        member,
        row.id,
        first.activity.id,
        input({ expectedVersion: 0, title: "Stale edit" }),
      ),
    /changed/,
  );
  assert.throws(
    () => activities.save(member, row.id, null, input()),
    /changed/,
  );
  const db = storage.database;
  db.exec(
    "CREATE TRIGGER fail_activity_audit BEFORE INSERT ON _sales_audit WHEN NEW.entity_type='activity' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END",
  );
  assert.throws(
    () =>
      activities.save(
        member,
        row.id,
        first.activity.id,
        input({ expectedVersion: 1, title: "Must roll back" }),
      ),
    /audit unavailable/,
  );
  assert.equal(activities.list(member).activities[0].title, "Confirmed survey");
  assert.equal(
    createSalesService({ storage, owners }).opportunity(row.id).version,
    2,
  );
});
test("Activity dates, reminders, query limits and communication references reject invalid input", (t) => {
  const { row, activities } = fixture(t);
  for (const extra of [
    { dueAt: "2026-02-30T12:00:00Z" },
    { dueAt: "2026-11-14T12:00:00" },
    { reminderAt: "2027-01-01T00:00:00Z" },
    { messageId: "not-a-message" },
    { expectedOpportunityVersion: 999 },
    { status: "cancelled", outcome: "" },
  ])
    assert.throws(() => activities.save(member, row.id, null, input(extra)));
  assert.throws(
    () => activities.list(member, { page: "1000000000000000" }),
    /valid activity/,
  );
  assert.throws(
    () => activities.list(member, { dueBefore: "yesterday" }),
    /date|datetime/,
  );
});

test("Customer context joins native records without copying customer data and supports reverse Sales navigation", (t) => {
  const { row, sales, activities, storage } = fixture(t);
  const customer = randomUUID();
  storage.database
    .prepare("INSERT INTO customers(id,name) VALUES(?,?)")
    .run(customer, "Original customer");
  storage.database
    .prepare("UPDATE _sales_opportunities SET customer_id=? WHERE id=?")
    .run(customer, row.id);
  activities.save(member, row.id, null, input());
  const context = sales.customerContext(customer);
  assert.equal(context.opportunities[0].id, row.id);
  assert.equal(context.opportunities[0].customer_name, "Original customer");
  assert.equal(context.openActivities, 1);
  storage.database
    .prepare("UPDATE customers SET name=? WHERE id=?")
    .run("Updated customer", customer);
  assert.equal(
    sales.customerContext(customer).opportunities[0].customer_name,
    "Updated customer",
  );
  assert.throws(() => sales.customerContext(randomUUID()), /not found/);
  assert.throws(() => sales.customerContext(customer, 0), /valid customer/);
});
