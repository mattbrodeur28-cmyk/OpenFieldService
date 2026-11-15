import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStorage } from "../src/server/sqlite.mjs";
import { createCrmService } from "../src/server/crm/service.mjs";

// CRM-001: accounts/contacts with roles, communication preferences and billing links.
const owner = { id: randomUUID(), role: "owner", active: true },
  member = { id: randomUUID(), role: "member", active: true },
  viewer = { id: randomUUID(), role: "viewer", active: true };

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "ofs-crm-")),
    storage = openStorage(join(dir, "test.sqlite")),
    db = storage.database,
    crm = createCrmService({ storage });
  const account = randomUUID(),
    otherAccount = randomUUID(),
    site = randomUUID(),
    otherSite = randomUUID();
  db.prepare("INSERT INTO customers(id,name) VALUES(?,'Acme Mechanical')").run(
    account,
  );
  db.prepare("INSERT INTO customers(id,name) VALUES(?,'Property Mgmt Co')").run(
    otherAccount,
  );
  db.prepare(
    "INSERT INTO sites(id,customer_id,name) VALUES(?,?,'Acme HQ')",
  ).run(site, account);
  db.prepare(
    "INSERT INTO sites(id,customer_id,name) VALUES(?,?,'Acme Plant')",
  ).run(otherSite, account);
  t.after(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { storage, db, crm, account, otherAccount, site, otherSite };
}

test("CRM contacts carry multiple roles and communication preferences", (t) => {
  const f = setup(t);
  const contact = f.crm.createContact(member, f.account, {
    name: "Dana Reyes",
    title: "Facilities Director",
    email: "dana@acme.test",
    phone: "555-0100",
    emailOk: true,
    phoneOk: true,
    smsOk: true,
    notes: "Prefers email",
    siteId: f.site,
    roles: ["service", "site_supervisor"],
  });
  assert.equal(contact.name, "Dana Reyes");
  assert.deepEqual(contact.roles, ["service", "site_supervisor"]);
  assert.equal(contact.smsOk, true);
  assert.equal(contact.version, 0);

  // A second contact for a different purpose on the same account.
  const billing = f.crm.createContact(member, f.account, {
    name: "Sam Patel",
    email: "ap@acme.test",
    roles: ["billing", "accounts_payable"],
  });
  assert.deepEqual(billing.roles, ["accounts_payable", "billing"]);

  // Lookup by role returns only the right people.
  const billers = f.crm.contactsByRole(owner, f.account, "billing");
  assert.deepEqual(
    billers.map((c) => c.name),
    ["Sam Patel"],
  );
  const service = f.crm.contactsByRole(owner, f.account, "service");
  assert.deepEqual(
    service.map((c) => c.name),
    ["Dana Reyes"],
  );

  // Site-scoped listing.
  const atSite = f.crm.listContacts(owner, f.account, { siteId: f.site });
  assert.deepEqual(
    atSite.map((c) => c.name),
    ["Dana Reyes"],
  );
  const all = f.crm.listContacts(owner, f.account);
  assert.equal(all.length, 2);
});

test("CRM contact validation blocks unusable contact records", (t) => {
  const f = setup(t);
  assert.throws(
    () =>
      f.crm.createContact(owner, f.account, {
        name: "No Way To Reach",
        roles: [],
      }),
    /email address or a phone number/,
  );
  // SMS consent without a phone is rejected once the contact is otherwise reachable.
  assert.throws(
    () =>
      f.crm.createContact(owner, f.account, {
        name: "SMS No Phone",
        email: "sms@acme.test",
        smsOk: true,
        roles: [],
      }),
    /SMS requires a phone number/,
  );
  assert.throws(
    () =>
      f.crm.createContact(owner, f.account, {
        name: "Invoice No Email",
        phone: "555-0188",
        roles: ["billing"],
      }),
    /billing contact needs an email/,
  );
  assert.throws(
    () =>
      f.crm.createContact(owner, f.account, {
        name: "Duplicate Roles",
        email: "dup@acme.test",
        roles: ["billing", "billing"],
      }),
    /only once/,
  );
  assert.throws(
    () =>
      f.crm.createContact(owner, f.account, {
        name: "Bad Email",
        email: "not-an-email",
        roles: [],
      }),
    /email/,
  );
});

test("CRM contacts reject cross-account site links and enforce optimistic versions", (t) => {
  const f = setup(t);
  const contact = f.crm.createContact(owner, f.account, {
    name: "Site Person",
    email: "site@acme.test",
    siteId: f.site,
    roles: ["service"],
  });

  // A site from a different account is refused.
  assert.throws(
    () =>
      f.crm.createContact(owner, f.otherAccount, {
        name: "Wrong Site",
        email: "x@other.test",
        siteId: f.site,
        roles: [],
      }),
    /different customer/,
  );

  const updated = f.crm.updateContact(member, contact.id, {
    name: "Site Person (Renamed)",
    email: "site@acme.test",
    siteId: f.site,
    expectedVersion: 0,
    roles: ["service", "estimator"],
  });
  assert.equal(updated.version, 1);
  assert.deepEqual(updated.roles, ["estimator", "service"]);

  // Stale write is rejected, not silently applied.
  assert.throws(
    () =>
      f.crm.updateContact(member, contact.id, {
        name: "Stale",
        email: "site@acme.test",
        expectedVersion: 0,
        roles: [],
      }),
    /changed in another session/,
  );
});

test("CRM contacts are archived rather than deleted so history survives", (t) => {
  const f = setup(t);
  const contact = f.crm.createContact(owner, f.account, {
    name: "Leaving Employee",
    email: "gone@acme.test",
    roles: ["service"],
  });
  const archived = f.crm.archiveContact(owner, contact.id);
  assert.equal(archived.active, false);
  // Archived contacts are hidden from the default list but retained when asked for.
  assert.equal(f.crm.listContacts(owner, f.account).length, 0);
  assert.equal(
    f.crm.listContacts(owner, f.account, { includeInactive: true }).length,
    1,
  );
  // Archiving twice is idempotent.
  assert.equal(
    f.crm.archiveContact(owner, contact.id).version,
    archived.version,
  );
  const restored = f.crm.restoreContact(owner, contact.id);
  assert.equal(restored.active, true);
  assert.equal(f.crm.listContacts(owner, f.account).length, 1);
});

test("CRM billing links let a different account be invoiced for a site", (t) => {
  const f = setup(t);
  const link = f.crm.createBillingLink(owner, f.account, {
    siteId: f.site,
    billingCustomerId: f.otherAccount,
    poRequired: true,
    notes: "Property manager pays",
  });
  assert.equal(link.billingName, "Property Mgmt Co");
  assert.equal(link.poRequired, true);

  // Duplicate billing party for the same site is a conflict.
  assert.throws(
    () =>
      f.crm.createBillingLink(owner, f.account, {
        siteId: f.site,
        billingCustomerId: f.otherAccount,
      }),
    /already the billing party/,
  );

  // Link must be created from the site's own account.
  assert.throws(
    () =>
      f.crm.createBillingLink(owner, f.otherAccount, {
        siteId: f.site,
        billingCustomerId: f.otherAccount,
      }),
    /different customer/,
  );

  const links = f.crm.listBillingLinks(owner, f.account);
  assert.equal(links.length, 1);
  // The billing party also sees the link against their account.
  assert.equal(f.crm.listBillingLinks(owner, f.otherAccount).length, 1);

  f.crm.removeBillingLink(owner, link.id);
  assert.equal(f.crm.listBillingLinks(owner, f.account).length, 0);
});

test("CRM account settings default, persist and reject parent loops", (t) => {
  const f = setup(t);
  const fallback = f.crm.accountSettings(owner, f.account);
  assert.equal(fallback.segment, "commercial");
  assert.equal(fallback.accountType, "customer");

  const saved = f.crm.saveAccountSettings(owner, f.account, {
    expectedVersion: 0,
    segment: "residential",
    accountType: "prospect",
  });
  assert.equal(saved.segment, "residential");
  assert.equal(saved.accountType, "prospect");
  assert.equal(f.crm.accountSettings(owner, f.account).accountType, "prospect");

  // Parent link then a reverse link would loop.
  f.crm.saveAccountSettings(owner, f.otherAccount, {
    expectedVersion: 0,
    parentCustomerId: f.account,
  }).parentCustomerId;
  assert.throws(
    () =>
      f.crm.saveAccountSettings(owner, f.account, {
        expectedVersion: 0,
        parentCustomerId: f.otherAccount,
      }),
    /relationship loop/,
  );
  assert.throws(
    () =>
      f.crm.saveAccountSettings(owner, f.account, {
        expectedVersion: 0,
        parentCustomerId: f.account,
      }),
    /cannot be its own parent/,
  );
});

test("CRM rejects viewers from mutating but lets them read", (t) => {
  const f = setup(t);
  f.crm.createContact(owner, f.account, {
    name: "Reader Target",
    email: "r@acme.test",
    roles: [],
  });
  assert.equal(f.crm.listContacts(viewer, f.account).length, 1);
  assert.throws(
    () =>
      f.crm.createContact(viewer, f.account, {
        name: "Nope",
        email: "n@acme.test",
        roles: [],
      }),
    /cannot change CRM records/,
  );
  const blocked = viewer;
  assert.throws(
    () =>
      f.crm.listContacts({ ...blocked, mustChangePassword: true }, f.account),
    /Sign in/,
  );
});

test("CRM writes are audited with before and after snapshots", (t) => {
  const f = setup(t);
  const c = f.crm.createContact(owner, f.account, {
    name: "Audited",
    email: "a@acme.test",
    roles: ["other"],
  });
  f.crm.updateContact(owner, c.id, {
    name: "Audited Renamed",
    email: "a@acme.test",
    expectedVersion: 0,
    roles: ["other"],
  });
  const rows = f.db
    .prepare(
      "SELECT action,before_json,after_json FROM _crm_audit WHERE entity_type='contact' AND entity_id=? ORDER BY id",
    )
    .all(c.id);
  assert.deepEqual(
    rows.map((r) => r.action),
    ["create", "update"],
  );
  assert.equal(rows[0].before_json, "null");
  assert.match(rows[1].after_json, /Audited Renamed/);
});

test("CRM HTTP routes enforce session, anti-CSRF and role checks, and return JSON errors", async (t) => {
  const { createService } = await import("../src/server/service/http.mjs");
  const f = setup(t);
  let actor = owner;
  const { app } = createService({
    storage: f.storage,
    currentUser: () => actor,
    people: () => [{ id: owner.id, name: "Owner" }],
  });
  const base = `/customers/${f.account}/contacts`;
  const headers = {
    "Content-Type": "application/json",
    "X-Requested-With": "OpenFieldService",
  };

  // No session.
  actor = null;
  assert.equal((await app.request(base)).status, 401);

  // Signed in but the write header is missing.
  actor = owner;
  assert.equal(
    (
      await app.request(base, {
        method: "POST",
        body: JSON.stringify({ name: "X", email: "x@a.test" }),
      })
    ).status,
    403,
  );

  // Viewer cannot mutate.
  actor = viewer;
  assert.equal(
    (
      await app.request(base, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "X", email: "x@a.test" }),
      })
    ).status,
    403,
  );

  // Malformed body is a 400 with a JSON message, not a 500.
  actor = owner;
  const bad = await app.request(base, {
    method: "POST",
    headers,
    body: "not json",
  });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /valid JSON/);

  // A real create succeeds and is then readable.
  const created = await app.request(base, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "HTTP Contact",
      email: "http@acme.test",
      roles: ["service"],
    }),
  });
  assert.equal(created.status, 201);
  const { contact } = await created.json();
  assert.equal(contact.name, "HTTP Contact");

  const list = await app.request(base);
  assert.equal(list.status, 200);
  assert.equal((await list.json()).contacts.length, 1);

  // Validation failures surface as 400 JSON.
  const invalid = await app.request(base, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Unreachable", roles: [] }),
  });
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error, /email address or a phone number/);

  // Missing customer is a 404.
  assert.equal(
    (await app.request(`/customers/${randomUUID()}/contacts`)).status,
    404,
  );
});

test("Customer 360 composes existing records without copying them", (t) => {
  const f = setup(t);
  // One job and one invoice for this account, so the summary has something real to read.
  const jobId = randomUUID(),
    invoiceId = randomUUID();
  f.db
    .prepare(
      "INSERT INTO jobs(id,identifier,customer_id,scheduled_date,status,price) VALUES(?,?,?,'2026-11-01','scheduled',120)",
    )
    .run(jobId, "JOB-360", f.account);
  f.db
    .prepare(
      "INSERT INTO invoices(id,identifier,customer_id,job_id,status,total) VALUES(?,?,?,?,'sent',120)",
    )
    .run(invoiceId, "INV-360", f.account, jobId);

  f.crm.createContact(owner, f.account, {
    name: "Site Lead",
    email: "lead@acme.test",
    roles: ["service"],
  });
  f.crm.createContact(owner, f.account, {
    name: "AP Person",
    email: "ap@acme.test",
    roles: ["billing"],
  });

  const view = f.crm.customer360(owner, f.account);
  assert.equal(view.account.name, "Acme Mechanical");
  assert.equal(view.counts.contacts, 2);
  assert.equal(view.counts.sites, 2); // Acme HQ + Acme Plant
  assert.equal(view.counts.openJobs, 1);
  assert.deepEqual(
    view.contactsByRole.billing.map((c) => c.name),
    ["AP Person"],
  );
  assert.deepEqual(
    view.contactsByRole.service.map((c) => c.name),
    ["Site Lead"],
  );
  assert.equal(view.recentJobs.length, 1);
  assert.equal(view.recentJobs[0].identifier, "JOB-360");

  // Invoice totals are a projection of the invoice rows, not a stored copy.
  assert.equal(view.invoices.count, 1);
  assert.equal(view.invoices.outstanding, 120);
  assert.equal(view.sites.length, 2);
});

test("Customer 360 reports absent modules as null instead of failing", (t) => {
  const f = setup(t);
  const view = f.crm.customer360(owner, f.account);
  // This fixture never creates Sales tables, so the section is honestly null.
  assert.equal(view.sales, null);
  // Equipment table exists but is empty.
  assert.equal(view.counts.equipment, 0);
  assert.deepEqual(view.equipment, []);
  assert.equal(view.contacts.length, 0);
});

test("Customer 360 rejects unknown customers and requires a session", (t) => {
  const f = setup(t);
  assert.throws(
    () => f.crm.customer360(owner, randomUUID()),
    /Customer not found/,
  );
  assert.throws(
    () =>
      f.crm.customer360({ id: "x", role: "viewer", active: false }, f.account),
    /Sign in/,
  );
});

test("Customer 360 uses the real Sales stage model and excludes draft/cancelled invoice debt", async (t) => {
  const { createSalesService } = await import(
    "../src/server/sales/service.mjs"
  );
  const f = setup(t),
    sales = createSalesService({ storage: f.storage, owners: () => [owner] }),
    pipeline = sales.pipelines()[0];
  const input = {
    title: "Native account opportunity",
    pipelineId: pipeline.id,
    stageId: pipeline.stages[0].id,
    ownerId: owner.id,
    prospectName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    segment: "commercial",
    source: "",
    expectedValue: 12345,
    probability: 10,
    expectedCloseDate: "",
    nextAction: "",
    nextActionDate: "",
    customerId: f.account,
    siteId: f.site,
    assetId: null,
    notes: "",
  };
  sales.saveOpportunity(owner, null, input);
  const lost = sales.saveOpportunity(owner, null, {
    ...input,
    title: "Lost bid",
    expectedValue: 99999,
  });
  sales.move(owner, lost.id, {
    expectedVersion: 0,
    stageId: pipeline.stages.find((s) => s.kind === "lost").id,
    reason: "Customer selected another supplier",
  });
  for (const [status, total] of [
    ["draft", 500],
    ["cancelled", 600],
    ["sent", 125.25],
    ["overdue", 10.5],
    ["paid", 80],
  ])
    f.db
      .prepare(
        "INSERT INTO invoices(id,identifier,customer_id,status,total) VALUES(?,?,?,?,?)",
      )
      .run(randomUUID(), status, f.account, status, total);
  const result = f.crm.customer360(viewer, f.account);
  assert.deepEqual(result.sales, {
    openOpportunities: 1,
    pipelineValue: 12345,
    currency: "USD",
  });
  assert.deepEqual(result.invoices, {
    count: 5,
    billed: 215.75,
    outstanding: 135.75,
    currency: "USD",
  });
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM customers").get().n, 2);
  f.db.exec("DROP TABLE invoice_lines; DROP TABLE invoices;");
  assert.equal(f.crm.customer360(owner, f.account).invoices, null);
});

test("CRM HTTP rechecks roles after streamed bodies and scopes contact and billing-link writes to account paths", async (t) => {
  const { createService } = await import("../src/server/service/http.mjs");
  const f = setup(t);
  let actor = owner;
  const { app } = createService({
    storage: f.storage,
    currentUser: () => actor,
    people: () => [owner],
  });
  const headers = {
    "Content-Type": "application/json",
    "X-Requested-With": "OpenFieldService",
  };
  const c = f.crm.createContact(owner, f.account, {
    name: "Scoped contact",
    email: "scoped@example.test",
    roles: ["service"],
  });
  const base = `/customers/${f.account}/contacts`,
    wrong = `/customers/${f.otherAccount}/contacts/${c.id}`;
  assert.equal(
    (
      await app.request(wrong, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          name: "Wrong account",
          email: c.email,
          expectedVersion: 0,
        }),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await app.request(wrong + "/archive", {
        method: "POST",
        headers,
        body: JSON.stringify({ expectedVersion: 0 }),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await app.request(`${base}/${c.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ name: "Missing version", email: c.email }),
      })
    ).status,
    400,
  );
  const link = f.crm.createBillingLink(owner, f.account, {
    siteId: f.site,
    billingCustomerId: f.account,
  });
  assert.equal(
    (
      await app.request(
        `/customers/${f.otherAccount}/billing-links/${link.id}`,
        { method: "DELETE", headers },
      )
    ).status,
    404,
  );
  assert.equal(f.crm.listContacts(owner, f.account)[0].name, "Scoped contact");
  const delayed = new ReadableStream({
    start(controller) {
      setTimeout(() => {
        actor = viewer;
        controller.enqueue(
          new TextEncoder().encode(
            JSON.stringify({
              name: "Revoked while reading",
              email: "race@example.test",
            }),
          ),
        );
        controller.close();
      }, 5);
    },
  });
  assert.equal(
    (
      await app.request(base, {
        method: "POST",
        headers,
        body: delayed,
        duplex: "half",
      })
    ).status,
    403,
  );
  actor = owner;
  const large = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(" ".repeat(60000)));
      c.close();
    },
  });
  assert.equal(
    (
      await app.request(base, {
        method: "POST",
        headers,
        body: large,
        duplex: "half",
      })
    ).status,
    413,
  );
  const archived = await app.request(`${base}/${c.id}/archive`, {
    method: "POST",
    headers,
    body: JSON.stringify({ expectedVersion: 0 }),
  });
  assert.equal(archived.status, 200);
  const restored = await app.request(`${base}/${c.id}/restore`, {
    method: "POST",
    headers,
    body: JSON.stringify({ expectedVersion: 1 }),
  });
  assert.equal(restored.status, 200);
  assert.equal(
    (
      await app.request(`${base}/${c.id}/archive`, {
        method: "POST",
        headers,
        body: JSON.stringify({ expectedVersion: 0 }),
      })
    ).status,
    409,
  );
  assert.equal(f.crm.listContacts(owner, f.account).length, 1);
});

test("CRM retains accurate old roles and rolls back contact changes if immutable audit insert fails", (t) => {
  const f = setup(t),
    c = f.crm.createContact(owner, f.account, {
      name: "Audit role source",
      email: "audit@example.test",
      roles: ["service"],
    });
  f.crm.updateContact(owner, c.id, {
    name: c.name,
    email: c.email,
    roles: ["billing"],
    expectedVersion: 0,
  });
  const event = f.db
    .prepare(
      "SELECT before_json,after_json FROM _crm_audit WHERE entity_id=? AND action='update'",
    )
    .get(c.id);
  assert.deepEqual(JSON.parse(event.before_json).roles, ["service"]);
  assert.deepEqual(JSON.parse(event.after_json).roles, ["billing"]);
  assert.throws(
    () => f.db.exec("UPDATE _crm_audit SET actor_id='changed'"),
    /IMMUTABLE/,
  );
  assert.throws(() => f.db.exec("DELETE FROM _crm_audit"), /IMMUTABLE/);
  f.db.exec(
    "CREATE TRIGGER fail_crm_audit BEFORE INSERT ON _crm_audit BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END;",
  );
  assert.throws(
    () =>
      f.crm.updateContact(owner, c.id, {
        name: "Should roll back",
        email: c.email,
        roles: ["other"],
        expectedVersion: 1,
      }),
    /audit failure/,
  );
  const unchanged = f.crm.listContacts(owner, f.account)[0];
  assert.equal(unchanged.name, c.name);
  assert.equal(unchanged.version, 1);
  assert.deepEqual(unchanged.roles, ["billing"]);
});

test("Account classifications reject stale saves and parent cycles beyond two accounts", (t) => {
  const f = setup(t),
    third = randomUUID();
  f.db
    .prepare("INSERT INTO customers(id,name) VALUES(?,?)")
    .run(third, "Third account");
  f.crm.saveAccountSettings(owner, f.account, {
    expectedVersion: 0,
    parentCustomerId: f.otherAccount,
  });
  f.crm.saveAccountSettings(owner, f.otherAccount, {
    expectedVersion: 0,
    parentCustomerId: third,
  });
  assert.throws(
    () =>
      f.crm.saveAccountSettings(owner, third, {
        expectedVersion: 0,
        parentCustomerId: f.account,
      }),
    /relationship loop/,
  );
  assert.throws(
    () =>
      f.crm.saveAccountSettings(owner, f.account, {
        expectedVersion: 0,
        segment: "residential",
      }),
    /changed/,
  );
  assert.equal(f.crm.accountSettings(owner, f.account).version, 1);
  assert.equal(f.crm.accountSettings(owner, third).parentCustomerId, null);
});

test("CRM v2 upgrades an existing v1 database without rewriting native contacts or account relationships", async (t) => {
  const { migrate } = await import("../src/server/platform/sqlite.mjs"),
    { crmSchema } = await import("../src/server/crm/schema.mjs");
  const dir = mkdtempSync(join(tmpdir(), "ofs-crm-upgrade-")),
    storage = openStorage(join(dir, "legacy.sqlite")),
    db = storage.database;
  t.after(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });
  migrate(db, "_crm_migrations", [{ version: 1, sql: crmSchema }]);
  const customerId = randomUUID(),
    contactId = randomUUID();
  db.prepare("INSERT INTO customers(id,name) VALUES(?,?)").run(
    customerId,
    "Existing account",
  );
  db.prepare(
    "INSERT INTO _crm_contacts(id,customer_id,name,email,version) VALUES(?,?,?,?,7)",
  ).run(contactId, customerId, "Existing contact", "legacy@example.test");
  db.prepare(
    "INSERT INTO _crm_contact_roles(contact_id,role) VALUES(?,'service')",
  ).run(contactId);
  db.prepare(
    "INSERT INTO _crm_account_settings(customer_id,segment,account_type) VALUES(?,'residential','prospect')",
  ).run(customerId);
  const checksum = db
    .prepare("SELECT checksum FROM _crm_migrations WHERE version=1")
    .get().checksum;
  const crm = createCrmService({ storage });
  assert.equal(crm.listContacts(owner, customerId)[0].version, 7);
  assert.equal(crm.accountSettings(owner, customerId).segment, "residential");
  assert.equal(crm.accountSettings(owner, customerId).version, 0);
  crm.saveAccountSettings(owner, customerId, {
    expectedVersion: 0,
    segment: "residential",
    accountType: "prospect",
  });
  createCrmService({ storage });
  assert.equal(crm.accountSettings(owner, customerId).version, 1);
  assert.equal(
    db.prepare("SELECT checksum FROM _crm_migrations WHERE version=1").get()
      .checksum,
    checksum,
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM customers").get().n, 1);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
});
