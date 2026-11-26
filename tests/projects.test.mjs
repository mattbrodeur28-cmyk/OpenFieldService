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
