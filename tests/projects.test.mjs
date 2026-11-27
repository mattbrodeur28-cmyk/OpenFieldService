import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStorage } from "../src/server/sqlite.mjs";
import { createProjects } from "../src/server/projects/service.mjs";

const owner = { id: "owner", role: "owner", active: true },
  member = { id: "member", role: "member", active: true },
  viewer = { id: "viewer", role: "viewer", active: true };
const reason = "Reviewed project structure";

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "ofs-projects-")),
    storage = openStorage(join(dir, "s.sqlite")),
    db = storage.database,
    projects = createProjects({ storage }),
    customer = randomUUID();
  db.prepare("INSERT INTO customers(id,name) VALUES(?,?)").run(customer, "Acme");
  t.after(() => { storage.close(); rmSync(dir, { recursive: true, force: true }); });
  return { db, projects, customer };
}

test("projects retain phases, milestones and linked jobs", (t) => {
  const f = setup(t);
  const saved = f.projects.save(owner, { id: randomUUID(), requestKey: randomUUID(), expectedVersion: 0, customerId: f.customer, title: "AHU retrofit", description: "Controls upgrade", status: "active", projectManager: owner.id, plannedStart: "2027-01-01", plannedEnd: "2027-06-30", reason, reviewAttested: true });
  assert.equal(saved.project.version, 1);
  assert.equal(saved.project.status, "active");
  const phase = f.projects.savePhase(owner, saved.project.id, { id: randomUUID(), requestKey: randomUUID(), expectedVersion: 0, name: "Demolition", costCode: "0100", owner: member.id, position: 1, reason, reviewAttested: true });
  assert.equal(phase.phase.costCode, "0100");
  f.projects.saveMilestone(owner, saved.project.id, { id: randomUUID(), requestKey: randomUUID(), name: "Startup complete", dueDate: "2027-06-30", completed: false, reason, reviewAttested: true });
  const job = randomUUID();
  f.db.prepare("INSERT INTO jobs(id,identifier,customer_id,scheduled_date) VALUES(?,?,?,'2027-01-10')").run(job, "J-1", f.customer);
  const link = f.projects.linkJob(owner, saved.project.id, { id: randomUUID(), requestKey: randomUUID(), jobId: job, phaseId: phase.phase.id, reason, reviewAttested: true });
  assert.equal(link.link.jobId, job);
  const site = randomUUID();
  f.db.prepare("INSERT INTO sites(id,customer_id,name) VALUES(?,?,?)").run(site, f.customer, "Site A");
  const siteLink = f.projects.linkSite(owner, saved.project.id, { id: randomUUID(), requestKey: randomUUID(), siteId: site, reason, reviewAttested: true });
  assert.equal(siteLink.link.siteId, site);
  f.projects.saveDeliverable(owner, saved.project.id, { id: randomUUID(), requestKey: randomUUID(), name: "O&M manual", dueDate: "2027-06-30", completed: false, reason, reviewAttested: true });
  const detail = f.projects.detail(owner, saved.project.id);
  assert.equal(detail.phases.length, 1);
  assert.equal(detail.milestones.length, 1);
  assert.equal(detail.jobs.length, 1);
  assert.equal(detail.sites.length, 1);
  assert.equal(detail.deliverables.length, 1);
  assert.equal(detail.jobs[0].phaseId, phase.phase.id);
  // idempotent replay of an identical update
  const update = { id: saved.project.id, requestKey: randomUUID(), expectedVersion: 1, customerId: f.customer, title: "AHU retrofit", description: "Controls upgrade", status: "active", projectManager: owner.id, plannedStart: "2027-01-01", plannedEnd: "2027-06-30", reason, reviewAttested: true };
  const first = f.projects.save(owner, update);
  assert.equal(first.project.version, 2);
  assert.deepEqual(f.projects.save(owner, update), first);
});

test("projects baseline, phase progress, issues and dependencies", (t) => {
  const f = setup(t);
  const saved = f.projects.save(owner, { id: randomUUID(), requestKey: randomUUID(), expectedVersion: 0, customerId: f.customer, title: "P", reason, reviewAttested: true });
  const pid = saved.project.id;
  const bl = f.projects.setBaseline(owner, pid, { requestKey: randomUUID(), baselineCostCents: 100000, baselineStart: "2027-01-01", baselineEnd: "2027-06-30", estimateToCompleteCents: 80000, reason, reviewAttested: true });
  assert.equal(bl.project.baseline_cost_cents, 100000);
  assert.equal(bl.project.version, 2);
  assert.ok(bl.project.baselined_at);
  const p1 = randomUUID(), p2 = randomUUID();
  f.projects.savePhase(owner, pid, { id: p1, requestKey: randomUUID(), expectedVersion: 0, name: "Phase 1", position: 1, percentComplete: 40, reason, reviewAttested: true });
  f.projects.savePhase(owner, pid, { id: p2, requestKey: randomUUID(), expectedVersion: 0, name: "Phase 2", position: 2, reason, reviewAttested: true });
  f.projects.saveIssue(owner, pid, { id: randomUUID(), requestKey: randomUUID(), title: "Permit delay", severity: "high", status: "open", assignedTo: "pm", dueDate: "2027-02-01", reason, reviewAttested: true });
  f.projects.saveDependency(owner, pid, { id: randomUUID(), requestKey: randomUUID(), phaseId: p2, dependsOnId: p1, reason, reviewAttested: true });
  const d = f.projects.detail(owner, pid);
  assert.equal(d.phases.find((p) => p.id === p1).percentComplete, 40);
  assert.equal(d.issues.length, 1);
  assert.equal(d.issues[0].severity, "high");
  assert.equal(d.dependencies.length, 1);
  assert.equal(d.dependencies[0].phaseId, p2);
  assert.throws(() => f.projects.saveDependency(owner, pid, { id: randomUUID(), requestKey: randomUUID(), phaseId: p1, dependsOnId: p1, reason, reviewAttested: true }), /itself/);
  assert.throws(() => f.projects.saveDependency(owner, pid, { id: randomUUID(), requestKey: randomUUID(), phaseId: p2, dependsOnId: p1, reason, reviewAttested: true }), /already exists/);
});

test("fromProposal converts an accepted proposal into a project without re-entering scope", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ofs-projects-")),
    storage = openStorage(join(dir, "s.sqlite")),
    db = storage.database,
    customer = randomUUID(),
    quoteId = randomUUID();
  db.prepare("INSERT INTO customers(id,name) VALUES(?,?)").run(customer, "Acme");
  const projects = createProjects({ storage, proposalSource: (u, q) => q === quoteId ? { customerId: customer, title: "AHU retrofit", scope: "Replace 4 AHUs with VAV controls" } : null });
  t.after(() => { storage.close(); rmSync(dir, { recursive: true, force: true }); });
  const result = projects.fromProposal(owner, { projectId: randomUUID(), requestKey: randomUUID(), quoteId, reason, reviewAttested: true });
  assert.equal(result.project.title, "AHU retrofit");
  assert.equal(result.project.source_kind, "quote");
  assert.equal(result.project.source_id, quoteId);
  assert.equal(result.project.customer_id, customer);
  assert.throws(() => projects.fromProposal(owner, { projectId: randomUUID(), requestKey: randomUUID(), quoteId, reason, reviewAttested: true }), /already converted/);
  assert.throws(() => projects.fromProposal(owner, { projectId: randomUUID(), requestKey: randomUUID(), quoteId: randomUUID(), reason, reviewAttested: true }), /accepted proposal/);
  assert.throws(() => createProjects({ storage }).fromProposal(owner, { projectId: randomUUID(), requestKey: randomUUID(), quoteId, reason, reviewAttested: true }), /not configured/);
});

test("projects reject stale versions, wrong-customer jobs and duplicate links", (t) => {
  const f = setup(t);
  const base = { id: randomUUID(), requestKey: randomUUID(), expectedVersion: 0, customerId: f.customer, title: "P", reason, reviewAttested: true };
  const saved = f.projects.save(owner, base);
  assert.throws(() => f.projects.save(owner, { ...base, requestKey: randomUUID(), expectedVersion: 0 }), /changed/);
  assert.throws(() => f.projects.save(viewer, { ...base, id: randomUUID(), requestKey: randomUUID(), expectedVersion: 0 }), /cannot change projects/);
  const other = randomUUID();
  f.db.prepare("INSERT INTO customers(id,name) VALUES(?,?)").run(other, "Other");
  const job = randomUUID();
  f.db.prepare("INSERT INTO jobs(id,identifier,customer_id,scheduled_date) VALUES(?,?,?,'2027-01-10')").run(job, "J-2", other);
  assert.throws(() => f.projects.linkJob(owner, saved.project.id, { id: randomUUID(), requestKey: randomUUID(), jobId: job, reason, reviewAttested: true }), /belonging to this project/);
  const goodJob = randomUUID();
  f.db.prepare("INSERT INTO jobs(id,identifier,customer_id,scheduled_date) VALUES(?,?,?,'2027-01-10')").run(goodJob, "J-3", f.customer);
  const link = { id: randomUUID(), requestKey: randomUUID(), jobId: goodJob, reason, reviewAttested: true };
  f.projects.linkJob(owner, saved.project.id, link);
  assert.throws(() => f.projects.linkJob(owner, saved.project.id, { ...link, id: randomUUID(), requestKey: randomUUID() }), /already linked/);
});

test("project job costing saves sections and computes P&L", (t) => {
  const f = setup(t);
  const saved = f.projects.save(owner, { id: randomUUID(), requestKey: randomUUID(), expectedVersion: 0, customerId: f.customer, title: "P", reason, reviewAttested: true });
  const pid = saved.project.id;
  const s1 = f.projects.saveCostSection(owner, pid, { id: randomUUID(), requestKey: randomUUID(), name: "PM Hours", position: 1, quantityMilli: 10000, costRateCents: 5000, billRateCents: 12000, reason, reviewAttested: true });
  assert.equal(s1.costSection.costCents, 50000);
  assert.equal(s1.costSection.billCents, 120000);
  assert.equal(s1.costSection.marginCents, 70000);
  const s2 = f.projects.saveCostSection(owner, pid, { id: randomUUID(), requestKey: randomUUID(), name: "Material", position: 2, quantityMilli: 1000, costRateCents: 10000, billRateCents: 15000, reason, reviewAttested: true });
  const d = f.projects.detail(owner, pid);
  assert.equal(d.costSections.length, 2);
  assert.equal(d.profitLoss.totalCostCents, 60000);
  assert.equal(d.profitLoss.totalBillableCents, 135000);
  assert.equal(d.profitLoss.profitCents, 75000);
  assert.equal(d.profitLoss.marginPercent, Math.round((75000 / 135000) * 1000) / 10);
  f.projects.deleteCostSection(owner, pid, s2.costSection.id);
  assert.equal(f.projects.detail(owner, pid).costSections.length, 1);
  assert.throws(() => f.projects.saveCostSection(viewer, pid, { id: randomUUID(), requestKey: randomUUID(), name: "X", reason, reviewAttested: true }), /cannot change projects/);
});

test("M11 end-to-end: field docs, crews, change orders, purchasing, subcontractors, progress billing, WIP and audit", (t) => {
  const f = setup(t);
  const techId = randomUUID();
  f.db.prepare("INSERT INTO technicians(id,name,email,phone) VALUES(?,?,?,?)").run(techId, "Alex Tech", "alex@example.test", "555-0100");

  // Commercial / Construction project with $100,000 contract and 10% retainage
  const saved = f.projects.save(owner, {
    id: randomUUID(), requestKey: randomUUID(), expectedVersion: 0, customerId: f.customer,
    title: "Chiller Plant Upgrade", track: "construction", contractValueCents: 10000000, retainageBps: 1000,
    status: "active", projectManager: owner.id, reason, reviewAttested: true,
  });
  const pid = saved.project.id;
  assert.equal(saved.project.track, "construction");
  assert.equal(saved.project.contract_value_cents, 10000000);

  f.projects.setBaseline(owner, pid, {
    requestKey: randomUUID(), baselineCostCents: 8000000, baselineStart: "2027-01-01", baselineEnd: "2027-06-30",
    estimateToCompleteCents: 4000000, reason, reviewAttested: true,
  });

  const phase1 = f.projects.savePhase(owner, pid, {
    id: randomUUID(), requestKey: randomUUID(), expectedVersion: 0,
    name: "Mechanical Install", costCode: "23-01", owner: owner.id, position: 1, percentComplete: 50, reason, reviewAttested: true,
  }).phase;

  // PROJ-003: Field documentation + signature intent validation + billing readiness gate
  assert.throws(() => f.projects.saveFieldDoc(member, pid, {
    id: randomUUID(), requestKey: randomUUID(), expectedVersion: 0,
    docType: "signature", title: "Signoff", signatureName: "", signatureIntent: "", reason, reviewAttested: true,
  }), /explicit stated approval intent/);

  const reqDoc = f.projects.saveFieldDoc(member, pid, {
    id: randomUUID(), requestKey: randomUUID(), expectedVersion: 0, phaseId: phase1.id,
    docType: "completion_evidence", title: "Pressure test report", body: "Passed 150 psi",
    billingRequired: true, status: "submitted", reason, reviewAttested: true,
  }).fieldDoc;
  assert.equal(f.projects.detail(owner, pid).billingReadiness.ready, false);

  // PROJ-004: Crew, effective-dated member, field time + approval
  const crew = f.projects.saveCrew(member, pid, {
    id: randomUUID(), requestKey: randomUUID(), expectedVersion: 0,
    name: "Pipefitters A", leadTechnicianId: techId, costCode: "23-01", active: true, reason, reviewAttested: true,
  }).crew;
  f.projects.addCrewMember(member, pid, crew.id, {
    id: randomUUID(), requestKey: randomUUID(), technicianId: techId, role: "lead",
    effectiveFrom: "2027-01-01", hourlyCostCents: 7500, hourlyBillCents: 14000, reason, reviewAttested: true,
  });
  const time1 = f.projects.recordCrewTime(member, pid, {
    id: randomUUID(), requestKey: randomUUID(), crewId: crew.id, technicianId: techId,
    phaseId: phase1.id, costCode: "23-01", workDate: "2027-01-15", hoursMilli: 10000, hourlyCostCents: 7500,
    notes: "Piping rough-in", reason, reviewAttested: true,
  }).timeEntry;
  assert.equal(time1.laborCostCents, 75000);
  assert.throws(() => f.projects.reviewCrewTime(member, pid, time1.id, { requestKey: randomUUID(), decision: "approved", reason, reviewAttested: true }), /Owner or Admin/);
  const approvedTime = f.projects.reviewCrewTime(owner, pid, time1.id, { requestKey: randomUUID(), decision: "approved", reason, reviewAttested: true }).timeEntry;
  assert.equal(approvedTime.status, "approved");

  // PROJ-005: Change orders (approved updates contract; pending does not)
  const co1 = f.projects.saveChangeOrder(member, pid, {
    id: randomUUID(), requestKey: randomUUID(), expectedVersion: 0, phaseId: phase1.id, costCode: "23-01",
    title: "Add VFD bypass", laborCostCents: 200000, materialCostCents: 300000, subcontractCostCents: 0,
    priceCents: 1000000, scheduleImpactDays: 5, reason, reviewAttested: true,
  }).changeOrder;
  const co1Sub = f.projects.transitionChangeOrder(member, pid, co1.id, { requestKey: randomUUID(), expectedVersion: co1.version, action: "submit", reason, reviewAttested: true }).changeOrder;
  assert.throws(() => f.projects.transitionChangeOrder(member, pid, co1.id, { requestKey: randomUUID(), expectedVersion: co1Sub.version, action: "approve", reason, reviewAttested: true }), /Owner or Admin/);
  const co1App = f.projects.transitionChangeOrder(owner, pid, co1.id, { requestKey: randomUUID(), expectedVersion: co1Sub.version, action: "approve", reason, reviewAttested: true }).changeOrder;
  const co1Acc = f.projects.transitionChangeOrder(owner, pid, co1.id, { requestKey: randomUUID(), expectedVersion: co1App.version, action: "customer_accept", customerAcceptedBy: "Jane GC", reason, reviewAttested: true }).changeOrder;
  assert.equal(co1Acc.customerAccepted, true);
  // Pending CO must not inflate approved totals
  f.projects.saveChangeOrder(member, pid, {
    id: randomUUID(), requestKey: randomUUID(), expectedVersion: 0,
    title: "Pending extra", priceCents: 5000000, reason, reviewAttested: true,
  });

  // PROJ-006: Purchasing commitments (no double-counting open commitment when received/billed)
  f.projects.savePurchasingLink(member, pid, {
    id: randomUUID(), requestKey: randomUUID(), phaseId: phase1.id, costCode: "23-01",
    description: "Chiller unit", committedCents: 3000000, receivedCents: 1000000, billedCents: 0, status: "received", reason, reviewAttested: true,
  });
  const purchSummary = f.projects.detail(owner, pid).purchasing.summary;
  assert.equal(purchSummary.committedCents, 3000000);
  assert.equal(purchSummary.receivedCents, 1000000);
  assert.equal(purchSummary.openCommitmentCents, 2000000);

  // PROJ-007: Subcontractor + invoice + retainage + compliance warnings
  const sub = f.projects.saveSubcontractor(member, pid, {
    id: randomUUID(), requestKey: randomUUID(), expectedVersion: 0, companyName: "Apex Controls Sub",
    scope: "BAS wiring", phaseId: phase1.id, costCode: "23-09", commitmentCents: 2000000, retainageBps: 1000,
    w9OnFile: false, status: "active", reason, reviewAttested: true,
  }).subcontractor;
  assert.ok(sub.complianceWarnings.includes("Missing W-9"));
  const subInvId = randomUUID();
  f.projects.submitSubInvoice(member, pid, sub.id, {
    id: subInvId, requestKey: randomUUID(), invoiceNumber: "SUB-101", periodEnd: "2027-01-31",
    grossCents: 500000, retainageCents: 50000, accountingRef: "AP-1", reason, reviewAttested: true,
  });
  const subAfter = f.projects.reviewSubInvoice(owner, pid, subInvId, { requestKey: randomUUID(), decision: "approved", reason, reviewAttested: true }).subcontractor;
  assert.equal(subAfter.approvedInvoicedCents, 500000);
  assert.equal(subAfter.retainageHeldCents, 50000);
  assert.equal(subAfter.remainingCommitmentCents, 1500000);

  // COM/CONST-001..003: SOV + Sequential Progress Billing Apps with Retainage
  const sov1 = f.projects.saveSovLine(owner, pid, {
    id: randomUUID(), requestKey: randomUUID(), expectedVersion: 0, phaseId: phase1.id, costCode: "23-01",
    itemNumber: "001", description: "Base Mechanical", scheduledValueCents: 10000000, position: 1, reason, reviewAttested: true,
  }).sovLine;
  const sov2 = f.projects.saveSovLine(owner, pid, {
    id: randomUUID(), requestKey: randomUUID(), expectedVersion: 0, phaseId: phase1.id, costCode: "23-01",
    itemNumber: "002", description: "CO-1 VFD Bypass", scheduledValueCents: 1000000, changeOrderId: co1.id, position: 2, reason, reviewAttested: true,
  }).sovLine;

  // Reject over-billing beyond scheduled value
  assert.throws(() => f.projects.createBillingApp(member, pid, {
    id: randomUUID(), requestKey: randomUUID(), periodStart: "2027-01-01", periodEnd: "2027-01-31",
    lines: [{ sovLineId: sov1.id, currentWorkCents: 10000001, materialsStoredCents: 0 }], reason, reviewAttested: true,
  }), /exceeds its scheduled value/);

  // Application #1: $30,000 work + $5,000 stored = $35,000; 10% retainage = $3,500; Due = $31,500
  const app1 = f.projects.createBillingApp(member, pid, {
    id: randomUUID(), requestKey: randomUUID(), periodStart: "2027-01-01", periodEnd: "2027-01-31",
    lines: [{ sovLineId: sov1.id, currentWorkCents: 3000000, materialsStoredCents: 500000 }], reason, reviewAttested: true,
  }).application;
  assert.equal(app1.applicationNumber, 1);
  assert.equal(app1.totalCompletedStoredCents, 3500000);
  assert.equal(app1.retainageHeldCents, 350000);
  assert.equal(app1.currentPaymentDueCents, 3150000);

  // Submitting blocked until required field doc is approved
  assert.throws(() => f.projects.transitionBillingApp(member, pid, app1.id, {
    requestKey: randomUUID(), expectedVersion: app1.version, action: "submit", reason, reviewAttested: true,
  }), /Required field documentation/);

  // Approve field doc, then submit & approve App #1
  f.projects.saveFieldDoc(owner, pid, {
    id: reqDoc.id, requestKey: randomUUID(), expectedVersion: reqDoc.version, phaseId: phase1.id,
    docType: "completion_evidence", title: reqDoc.title, body: reqDoc.body, billingRequired: true, status: "approved", reason, reviewAttested: true,
  });
  const app1Sub = f.projects.transitionBillingApp(member, pid, app1.id, { requestKey: randomUUID(), expectedVersion: app1.version, action: "submit", reason, reviewAttested: true }).application;
  const app1App = f.projects.transitionBillingApp(owner, pid, app1.id, { requestKey: randomUUID(), expectedVersion: app1Sub.version, action: "approve", reason, reviewAttested: true }).application;
  assert.equal(app1App.status, "approved");

  // Record payment separately from approval
  const app1Paid = f.projects.transitionBillingApp(owner, pid, app1.id, { requestKey: randomUUID(), expectedVersion: app1App.version, action: "record_payment", paymentCents: 3150000, reason, reviewAttested: true }).application;
  assert.equal(app1Paid.paymentRecordedCents, 3150000);

  // Export continuation sheet HTML
  const html = f.projects.exportBillingAppHtml(viewer, pid, app1.id);
  assert.match(html, /Progress Billing Application #1/);
  assert.match(html, /not a licensed AIA-branded form/);

  // Sequential Application #2 carries forward $35,000 previous, adds $20,000 on SOV1 + $10,000 on CO-1 = $65,000 cumulative
  const app2 = f.projects.createBillingApp(member, pid, {
    id: randomUUID(), requestKey: randomUUID(), periodStart: "2027-02-01", periodEnd: "2027-02-28",
    lines: [
      { sovLineId: sov1.id, currentWorkCents: 2000000, materialsStoredCents: 0 },
      { sovLineId: sov2.id, currentWorkCents: 1000000, materialsStoredCents: 0 },
    ],
    reason, reviewAttested: true,
  }).application;
  assert.equal(app2.applicationNumber, 2);
  assert.equal(app2.totalCompletedStoredCents, 6500000);
  assert.equal(app2.previousCertificatesCents, 3150000);
  assert.equal(app2.currentPaymentDueCents, 2700000); // $58,500 earned less retainage - $31,500 prior = $27,000

  // PROJ-008: WIP reporting + immutable snapshot
  const wipRes = f.projects.getWip(owner, pid, "cost_to_cost");
  assert.equal(wipRes.wip.revisedContractCents, 11000000); // $100k + $10k approved CO (pending $50k CO excluded)
  assert.equal(wipRes.wip.actualCostCents, 75000 + 500000 + 1000000); // crew + sub + purchasing received
  assert.equal(wipRes.wip.committedCostCents, 2000000 + 1500000); // open purchasing + remaining sub
  assert.equal(wipRes.wip.billedToDateCents, 3500000); // latest approved App #1

  const snap = f.projects.createWipSnapshot(owner, pid, {
    id: randomUUID(), requestKey: randomUUID(), asOfDate: "2027-01-31", method: "cost_to_cost", reason, reviewAttested: true,
  }).snapshot;
  assert.equal(snap.revisedContractCents, 11000000);
  assert.throws(() => f.db.prepare("DELETE FROM _project_wip_snapshots WHERE id=?").run(snap.id), /PROJECT_WIP_IMMUTABLE/);

  // PROJ-009: Audit trail populated and immutable
  const auditRows = f.projects.auditLog(owner, pid);
  assert.ok(auditRows.length >= 10);
  assert.throws(() => f.db.prepare("DELETE FROM _project_audit WHERE project_id=?").run(pid), /PROJECT_AUDIT_IMMUTABLE/);
});
