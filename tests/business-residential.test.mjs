import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStorage } from "../src/server/sqlite.mjs";
import { createBusinessService } from "../src/server/business/service.mjs";
import { createResidentialService } from "../src/server/residential/service.mjs";

const owner = { id: "owner-1", role: "owner", active: true };
const member = { id: "member-1", role: "member", active: true };
const viewer = { id: "viewer-1", role: "viewer", active: true };

test("M8 Business Owner: dashboard, saved reports CSV/JSON, automation dry-run, and isolated customer portal", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ofs-m8-"));
  const storage = openStorage(join(dir, "s.sqlite"));
  const db = storage.database;
  t.after(() => { storage.close(); rmSync(dir, { recursive: true, force: true }); });

  const biz = createBusinessService({ storage });
  const customerId = randomUUID();
  const jobId = randomUUID();
  const invId = randomUUID();
  db.prepare("INSERT INTO customers(id,name,email) VALUES(?,?,?)").run(customerId, "Oakwood Properties", "ops@oakwood.test");
  db.prepare("INSERT INTO jobs(id,identifier,customer_id,scheduled_date,status,priority,price) VALUES(?,?,?,'2026-01-01','confirmed','urgent',500)").run(jobId, "J-100", customerId);
  db.prepare("INSERT INTO invoices(id,identifier,customer_id,job_id,status,subtotal,tax_amount,total,due_date) VALUES(?,?,?,?,'overdue',500,0,500,'2026-01-15')").run(invId, "INV-100", customerId, jobId);

  // Member/Viewer cannot access Business Owner controls
  assert.throws(() => biz.dashboard(member), /Owner or Admin/);
  assert.throws(() => biz.dashboard(viewer), /Owner or Admin/);

  // BIZ-001..004: Live dashboard metrics
  const dash = biz.dashboard(owner);
  assert.equal(dash.dispatch.unassignedJobs, 1);
  assert.equal(dash.dispatch.overdueJobs, 1);
  assert.equal(dash.financials.outstandingInvoices, 1);
  assert.equal(dash.financials.overdueCents, 50000);

  // BIZ-005: Saved report + CSV/JSON export
  const rep = biz.saveReport(owner, { name: "AR Aging Export", dataset: "invoices", schedule: "weekly", filters: {} }).report;
  const csv = biz.exportReport(owner, rep.id, "csv");
  assert.equal(csv.rowCount, 1);
  assert.match(csv.body, /INV-100/);

  // BIZ-006: Automation rule + dry-run preview (no mutations)
  const auto = biz.saveAutomation(owner, { name: "Flag overdue AR", triggerKind: "invoice_overdue", actionKind: "flag_review", requiresApproval: true, enabled: false, config: {} }).automation;
  const dry = biz.dryRunAutomation(owner, auto.id);
  assert.equal(dry.mode, "dry_run");
  assert.equal(dry.matchedCount, 1);

  // BIZ-007: External customer portal bearer token (customer-scoped, revocable)
  const issued = biz.issuePortalToken(owner, { customerId, label: "Property Manager", expiresInDays: 30, scopes: ["invoices", "reports"] });
  assert.ok(issued.token.startsWith("ofsp_"));
  const portal = biz.portalView(issued.token);
  assert.equal(portal.customer.id, customerId);
  assert.equal(portal.invoices.length, 1);
  assert.equal(portal.invoices[0].identifier, "INV-100");

  biz.revokePortalToken(owner, issued.id);
  assert.throws(() => biz.portalView(issued.token), /expired or revoked/);
});

test("M12 Residential: memberships, 3-option estimates, call booking, adaptive dispatch, mobile packet and field payments", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ofs-m12-"));
  const storage = openStorage(join(dir, "s.sqlite"));
  const db = storage.database;
  t.after(() => { storage.close(); rmSync(dir, { recursive: true, force: true }); });

  const res = createResidentialService({ storage });
  const customerId = randomUUID();
  const techId = randomUUID();
  db.prepare("INSERT INTO customers(id,name,address) VALUES(?,?,?)").run(customerId, "Sarah Homeowner", "42 Maple St");
  db.prepare("INSERT INTO technicians(id,name,email,phone,active) VALUES(?,?,?,?,1)").run(techId, "Mike Tech", "mike@example.test", "555-0144");

  // RES-001: Membership plan + customer enrollment with recorded auto-renew authorization
  const plan = res.savePlan(owner, { name: "Comfort Club Gold", billingCycle: "annual", priceCents: 24900, visitsPerYear: 2, discountBps: 1500, benefitsText: "2 tune-ups + 15% off", active: true }).plan;
  assert.throws(() => res.enrollMembership(member, {
    requestKey: randomUUID(), customerId, planId: plan.id, startsOn: "2027-01-01", renewalDate: "2028-01-01",
    autoRenewAuthorized: true, authorizedBy: "",
  }), /authorized automatic renewal/);

  const mem = res.enrollMembership(member, {
    requestKey: randomUUID(), customerId, planId: plan.id, startsOn: "2027-01-01", renewalDate: "2028-01-01",
    autoRenewAuthorized: true, authorizedBy: "Sarah Homeowner",
  }).membership;
  assert.equal(mem.status, "active");
  assert.equal(mem.discountBps, 1500);

  // RES-003 & RES-005: Call booking + duplicate guard + adaptive dispatch + dispatch handoff
  const b1 = res.createBooking(member, {
    requestKey: randomUUID(), customerId, channel: "phone", issue: "AC blowing warm air", urgency: "urgent",
    preferredDate: "2027-07-01", preferredWindow: "morning",
  }).booking;
  assert.throws(() => res.createBooking(member, {
    requestKey: randomUUID(), customerId, channel: "online", issue: "AC blowing warm air", urgency: "urgent",
    preferredDate: "2027-07-01", preferredWindow: "afternoon",
  }), /already exists/);

  const adaptive = res.adaptiveDispatch(owner);
  assert.equal(adaptive.requiresDispatcherApproval, true);
  assert.equal(adaptive.suggestions.length, 1);

  const dispatched = res.dispatchBooking(member, b1.id, { requestKey: randomUUID(), technicianId: techId, scheduledTime: "09:30" });
  assert.ok(dispatched.jobId);
  assert.equal(dispatched.booking.status, "dispatched");

  // RES-002: Pricebook + Good/Better/Best tablet estimate -> native job + invoice conversion
  res.savePricebookItem(owner, { code: "CAP-45", name: "Dual Run Capacitor", category: "electrical", unitPriceCents: 28500, memberDiscountEligible: true, taxable: true, active: true });
  const est = res.createEstimate(member, {
    requestKey: randomUUID(), customerId, jobId: dispatched.jobId, title: "Condenser Repair Options",
    options: {
      good: { label: "Good", summary: "Capacitor only", items: [{ name: "Dual Run Capacitor", quantity: 1, unitPriceCents: 28500 }], taxCents: 0 },
      better: { label: "Better", summary: "Capacitor + contactor + coil wash", items: [{ name: "Repair + Tune-Up", quantity: 1, unitPriceCents: 65000 }], taxCents: 0 },
      best: { label: "Best", summary: "Full condenser refresh + surge protector", items: [{ name: "Premium Package", quantity: 1, unitPriceCents: 115000 }], taxCents: 0 },
    },
  }).estimate;
  const accepted = res.acceptEstimate(member, est.id, { requestKey: randomUUID(), chosenTier: "better", acceptedBy: "Sarah Homeowner", createInvoice: true });
  assert.equal(accepted.estimate.chosenTier, "better");
  assert.equal(accepted.estimate.acceptedTotalCents, 65000);
  assert.ok(accepted.invoiceId);

  // RES-004: Technician mobile job packet
  const packet = res.mobilePacket(member, dispatched.jobId);
  assert.equal(packet.customer.id, customerId);
  assert.equal(packet.memberships.length, 1);
  assert.equal(packet.invoices.length, 1);

  // RES-007: Idempotent field payment intent + external financing referral
  const payKey = randomUUID();
  const pay1 = res.recordPaymentIntent(member, {
    requestKey: payKey, invoiceId: accepted.invoiceId, provider: "stripe_terminal",
    providerTokenRef: "pi_tok_123", amountCents: 65000, status: "succeeded", notes: "Paid on tablet",
  });
  assert.deepEqual(res.recordPaymentIntent(member, {
    requestKey: payKey, invoiceId: accepted.invoiceId, provider: "stripe_terminal",
    providerTokenRef: "pi_tok_123", amountCents: 65000, status: "succeeded", notes: "Paid on tablet",
  }), pay1);
  assert.equal(db.prepare("SELECT status FROM invoices WHERE id=?").get(accepted.invoiceId).status, "paid");

  const ref = res.createFinancingReferral(member, { customerId, estimateId: est.id, providerName: "GreenSky", requestedCents: 115000, externalRef: "GS-991" }).referral;
  assert.equal(ref.status, "referred");

  // RES-006 / RES-008: Overview KPIs & handoff note
  const ov = res.overview(owner);
  assert.equal(ov.kpis.activeMemberships, 1);
  assert.equal(ov.kpis.estimateConversionPct, 100);
  assert.equal(ov.kpis.fieldCollectedCents, 65000);
});
