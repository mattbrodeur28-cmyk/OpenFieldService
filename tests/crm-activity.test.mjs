import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStorage } from "../src/server/sqlite.mjs";
import { createCrmService } from "../src/server/crm/service.mjs";

// CRM-004: customer activities (notes, tasks, follow-ups) with reminders and a
// private vs customer-facing boundary.
const owner = { id: randomUUID(), role: "owner", active: true },
  member = { id: randomUUID(), role: "member", active: true },
  viewer = { id: randomUUID(), role: "viewer", active: true };

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "ofs-crm-activity-")),
    storage = openStorage(join(dir, "test.sqlite")),
    db = storage.database,
    crm = createCrmService({ storage, people: () => [owner, member], clock: () => new Date("2026-11-25T12:00:00Z") });
  const account = randomUUID();
  db.prepare("INSERT INTO customers(id,name) VALUES(?,?)").run(account, "Acme Mechanical");
  t.after(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { storage, db, crm, account };
}

test("CRM notes record internal vs customer-facing information without an assignee or due date", (t) => {
  const f = setup(t);
  const note = f.crm.activities.save(owner, f.account, null, {
    kind: "note",
    visibility: "customer_visible",
    title: "Customer prefers email",
    details: "Confirmed during visit",
    status: "done",
    outcome: "Recorded",
  });
  assert.equal(note.activity.kind, "note");
  assert.equal(note.activity.visibility, "customer_visible");
  assert.equal(note.activity.status, "done");
  assert.equal(note.activity.assigneeId, "");
  assert.equal(note.activity.dueAt, null);
  assert.equal(note.activity.version, 0);
  // A note must be recorded as done with an outcome.
  assert.throws(
    () => f.crm.activities.save(owner, f.account, null, { kind: "note", title: "Incomplete note" }),
    /recorded as done/,
  );
  assert.throws(
    () => f.crm.activities.save(owner, f.account, null, { kind: "note", title: "x", status: "done" }),
    /outcome or completion reason/,
  );
  // A note cannot carry an assignee, due date or reminder.
  assert.throws(
    () => f.crm.activities.save(owner, f.account, null, { kind: "note", title: "x", status: "done", outcome: "abc", assigneeId: owner.id }),
    /Notes have no assignee/,
  );
});

test("CRM tasks and follow-ups require an assignee, a due date and a completion outcome", (t) => {
  const f = setup(t);
  assert.throws(
    () => f.crm.activities.save(owner, f.account, null, { kind: "task", title: "Call back", status: "open" }),
    /assignee and a due date/,
  );
  const task = f.crm.activities.save(owner, f.account, null, {
    kind: "task",
    title: "Call back",
    assigneeId: member.id,
    dueAt: "2026-12-01T09:00:00Z",
    reminderAt: "2026-12-01T08:00:00Z",
    status: "open",
  });
  assert.equal(task.activity.status, "open");
  assert.equal(task.activity.assigneeId, member.id);
  assert.equal(task.activity.reminderAt, "2026-12-01T08:00:00.000Z");
  assert.throws(
    () =>
      f.crm.activities.save(owner, f.account, null, {
        kind: "follow_up",
        title: "x",
        assigneeId: member.id,
        dueAt: "2026-12-01T09:00:00Z",
        reminderAt: "2026-12-01T10:00:00Z",
      }),
    /at or before/,
  );
  assert.throws(
    () =>
      f.crm.activities.save(owner, f.account, null, {
        kind: "task",
        title: "x",
        assigneeId: randomUUID(),
        dueAt: "2026-12-01T09:00:00Z",
      }),
    /active activity assignee/,
  );
  const done = f.crm.activities.save(owner, f.account, task.activity.id, {
    kind: "task",
    title: "Call back",
    assigneeId: member.id,
    dueAt: "2026-12-01T09:00:00Z",
    status: "done",
    outcome: "Reached customer",
    expectedVersion: 0,
  });
  assert.equal(done.activity.status, "done");
  assert.equal(done.activity.completedBy, owner.id);
  assert.equal(done.activity.version, 1);
  assert.throws(
    () =>
      f.crm.activities.save(owner, f.account, task.activity.id, {
        kind: "task",
        title: "Stale",
        assigneeId: member.id,
        dueAt: "2026-12-01T09:00:00Z",
        status: "done",
        outcome: "abc",
        expectedVersion: 0,
      }),
    /changed/,
  );
});

test("CRM reminders and list filters project the current user's open work", (t) => {
  const f = setup(t);
  f.crm.activities.save(owner, f.account, null, {
    kind: "follow_up",
    title: "Chase signature",
    assigneeId: member.id,
    dueAt: "2026-11-20T09:00:00Z",
    reminderAt: "2026-11-20T08:00:00Z",
  });
  f.crm.activities.save(owner, f.account, null, {
    kind: "task",
    title: "Renewal prep",
    assigneeId: member.id,
    dueAt: "2030-01-01T09:00:00Z",
    reminderAt: "2030-01-01T08:00:00Z",
  });
  const reminders = f.crm.activities.reminders(member);
  assert.equal(reminders.total, 1);
  assert.equal(reminders.activities[0].title, "Chase signature");
  assert.equal(f.crm.activities.list(owner, f.account, { status: "open" }).total, 2);
  assert.equal(f.crm.activities.list(owner, f.account, { status: "done" }).total, 0);
  assert.equal(f.crm.activities.list(owner, f.account, { kind: "task" }).total, 1);
});

test("CRM activities reject viewers from mutating but let them read, and roll back on audit failure", (t) => {
  const f = setup(t);
  f.crm.activities.save(owner, f.account, null, {
    kind: "task",
    title: "Readable task",
    assigneeId: member.id,
    dueAt: "2026-12-01T09:00:00Z",
  });
  assert.equal(f.crm.activities.list(viewer, f.account).total, 1);
  assert.throws(
    () =>
      f.crm.activities.save(viewer, f.account, null, {
        kind: "task",
        title: "Nope",
        assigneeId: member.id,
        dueAt: "2026-12-01T09:00:00Z",
      }),
    /cannot change CRM records/,
  );
  f.db.exec(
    "CREATE TRIGGER fail_crm_activity_audit BEFORE INSERT ON _crm_audit BEGIN SELECT RAISE(ABORT,'fixture activity audit failure'); END;",
  );
  assert.throws(
    () =>
      f.crm.activities.save(owner, f.account, null, {
        kind: "task",
        title: "Rolled back",
        assigneeId: member.id,
        dueAt: "2026-12-01T09:00:00Z",
      }),
    /activity audit failure/,
  );
  assert.equal(f.crm.activities.list(owner, f.account).total, 1);
});

test("CRM activity HTTP routes enforce session, CSRF and role checks and return JSON errors", async (t) => {
  const { createService } = await import("../src/server/service/http.mjs");
  const f = setup(t);
  let actor = owner;
  const { app } = createService({
    storage: f.storage,
    currentUser: () => actor,
    people: () => [owner, member],
  });
  const base = `/customers/${f.account}/activities`;
  const headers = { "Content-Type": "application/json", "X-Requested-With": "OpenFieldService" };

  actor = null;
  assert.equal((await app.request(base)).status, 401);

  actor = owner;
  assert.equal(
    (
      await app.request(base, {
        method: "POST",
        body: JSON.stringify({ kind: "note", title: "x", status: "done", outcome: "abc" }),
      })
    ).status,
    403,
  );

  actor = viewer;
  assert.equal(
    (
      await app.request(base, {
        method: "POST",
        headers,
        body: JSON.stringify({ kind: "note", title: "x", status: "done", outcome: "abc" }),
      })
    ).status,
    403,
  );

  actor = owner;
  const created = await app.request(base, {
    method: "POST",
    headers,
    body: JSON.stringify({ kind: "note", title: "HTTP note", status: "done", outcome: "abc" }),
  });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).activity.title, "HTTP note");

  const list = await app.request(base);
  assert.equal(list.status, 200);
  assert.equal((await list.json()).total, 1);

  const invalid = await app.request(base, {
    method: "POST",
    headers,
    body: JSON.stringify({ kind: "task", title: "No assignee" }),
  });
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error, /assignee and a due date/);
});

test("Customer 360 includes bounded activity and agreement projections", (t) => {
  const f = setup(t);
  f.crm.activities.save(owner, f.account, null, {
    kind: "task",
    title: "Open task",
    assigneeId: member.id,
    dueAt: "2026-12-01T09:00:00Z",
  });
  f.crm.activities.save(owner, f.account, null, {
    kind: "note",
    title: "Recent note",
    status: "done",
    outcome: "abc",
  });
  f.db.exec(
    "CREATE TABLE _agreement_drafts(id TEXT PRIMARY KEY,number INTEGER,customer_id TEXT,title TEXT,version INTEGER,archived INTEGER)",
  );
  f.db
    .prepare(
      "INSERT INTO _agreement_drafts(id,number,customer_id,title,version,archived) VALUES(?,?,?,?,?,?)",
    )
    .run(randomUUID(), 1, f.account, "PM agreement", 2, 0);
  const view = f.crm.customer360(owner, f.account);
  assert.equal(view.activity.open, 1);
  assert.equal(view.activity.recent.length, 2);
  assert.equal(view.agreements.count, 1);
  assert.equal(view.agreements.recent[0].title, "PM agreement");
  assert.equal(view.agreements.recent[0].archived, false);
});

test("CRM duplicate candidates group accounts by normalized email, phone and name without merging", (t) => {
  const f = setup(t);
  const a = randomUUID(),
    b = randomUUID();
  f.db.prepare("INSERT INTO customers(id,name,email,phone) VALUES(?,?,?,?)").run(a, "ACME Mechanical", "dupe@example.test", "555-0100");
  f.db.prepare("INSERT INTO customers(id,name,email,phone) VALUES(?,?,?,?)").run(b, "Acme  Mechanical", "dupe@example.test", "(555) 0100");
  const candidates = f.crm.duplicateCandidates(owner);
  const email = candidates.find((g) => g.kind === "email");
  assert.equal(email.customers.length, 2);
  assert.deepEqual(new Set(email.customers.map((c) => c.id)), new Set([a, b]));
  const phone = candidates.find((g) => g.kind === "phone");
  assert.equal(phone.customers.length, 2);
  const name = candidates.find((g) => g.kind === "name");
  assert.equal(name.customers.length, 3); // includes the setup account
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM customers").get().n, 3);
});

test("customer export is Owner/Admin-only and escapes CSV fields", (t) => {
  const f = setup(t);
  f.crm.createContact(owner, f.account, { name: "AP, Inc.", email: "ap@acme.test", roles: ["billing"] });
  const json = f.crm.exportCustomers(owner, "json");
  assert.equal(json.format, "json");
  assert.equal(json.customers.length, 1);
  assert.equal(json.customers[0].segment, "commercial");
  assert.equal(json.customers[0].contacts.length, 1);
  assert.throws(() => f.crm.exportCustomers(member, "json"), /Owner or Admin/);
  assert.throws(() => f.crm.exportCustomers(viewer, "json"), /Owner or Admin/);
  const csv = f.crm.exportCustomers(owner, "csv");
  assert.match(csv.body, /segment/);
  assert.match(csv.body, /"AP, Inc\./);
});

test("CRM communications link to a contact with outbound consent enforcement", (t) => {
  const f = setup(t);
  const contact = f.crm.createContact(owner, f.account, { name: "No SMS", email: "nosms@acme.test", smsOk: false, roles: [] });
  const email = f.crm.communications.record(owner, f.account, {
    contactId: contact.id,
    channel: "email",
    direction: "outbound",
    subject: "Quote",
    occurredAt: "2026-11-26T09:00:00Z",
  });
  assert.equal(email.communication.channel, "email");
  assert.equal(email.communication.direction, "outbound");
  assert.throws(
    () => f.crm.communications.record(owner, f.account, { contactId: contact.id, channel: "sms", direction: "outbound", occurredAt: "2026-11-26T09:00:00Z" }),
    /not consented to SMS/,
  );
  const inbound = f.crm.communications.record(owner, f.account, {
    contactId: contact.id,
    channel: "sms",
    direction: "inbound",
    occurredAt: "2026-11-26T09:00:00Z",
  });
  assert.equal(inbound.communication.direction, "inbound");
  const other = randomUUID();
  f.db.prepare("INSERT INTO customers(id,name) VALUES(?,?)").run(other, "Other");
  assert.throws(
    () => f.crm.communications.record(owner, other, { contactId: contact.id, channel: "email", direction: "outbound", occurredAt: "2026-11-26T09:00:00Z" }),
    /does not belong/,
  );
  assert.equal(f.crm.communications.list(owner, f.account).total, 2);
  assert.throws(
    () => f.crm.communications.record(viewer, f.account, { channel: "email", direction: "outbound", occurredAt: "2026-11-26T09:00:00Z" }),
    /cannot change CRM records/,
  );
});

test("CRM v3 upgrades an existing v2 database without rewriting contacts", async (t) => {
  const { migrate } = await import("../src/server/platform/sqlite.mjs"),
    { crmSchema } = await import("../src/server/crm/schema.mjs"),
    { reviewSchema } = await import("../src/server/crm/review-schema.mjs");
  const dir = mkdtempSync(join(tmpdir(), "ofs-crm-activity-upgrade-")),
    storage = openStorage(join(dir, "legacy.sqlite")),
    db = storage.database;
  t.after(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });
  migrate(db, "_crm_migrations", [
    { version: 1, sql: crmSchema },
    { version: 2, sql: reviewSchema },
  ]);
  const customerId = randomUUID();
  db.prepare("INSERT INTO customers(id,name) VALUES(?,?)").run(customerId, "Existing");
  db.prepare("INSERT INTO _crm_contacts(id,customer_id,name,email,version) VALUES(?,?,?,?,3)").run(randomUUID(), customerId, "Keep me", "keep@example.test");
  const crm = createCrmService({ storage, people: () => [owner] });
  assert.equal(crm.listContacts(owner, customerId)[0].version, 3);
  assert.equal(db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='_crm_activities'").get().ok, 1);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
});
