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
