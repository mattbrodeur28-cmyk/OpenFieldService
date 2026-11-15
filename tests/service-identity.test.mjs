import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStorage } from "../src/server/sqlite.mjs";
import { createServiceIdentity } from "../src/server/service/identity.mjs";
import { createService } from "../src/server/service/http.mjs";
const owner = { id: randomUUID(), role: "owner", active: true },
  member = { id: randomUUID(), role: "member", active: true },
  other = { id: randomUUID(), role: "member", active: true },
  hr = { id: randomUUID(), role: "member", active: true, hr: true },
  viewer = { id: randomUUID(), role: "viewer", active: true };
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "ofs-tech-identity-")),
    filename = join(dir, "service.sqlite"),
    storage = openStorage(filename),
    db = storage.database,
    tech = randomUUID(),
    secondTech = randomUUID(),
    customer = randomUUID(),
    job = randomUUID();
  for (const [id, name] of [
    [tech, "Same display name"],
    [secondTech, "Same display name"],
  ])
    db.prepare("INSERT INTO technicians(id,name) VALUES(?,?)").run(id, name);
  db.prepare("INSERT INTO customers(id,name) VALUES(?,?)").run(
    customer,
    "Native customer",
  );
  db.prepare(
    "INSERT INTO jobs(id,identifier,customer_id,technician_id,scheduled_date,scheduled_time,duration) VALUES(?,'IDENTITY-PREVIEW',?,?,'2026-11-16','09:00',60)",
  ).run(job, customer, tech);
  const people = () =>
      [owner, member, other, hr].map((user) => ({
        id: user.id,
        name: "Same display name",
      })),
    service = createServiceIdentity({ storage, people });
  t.after(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { storage, filename, db, tech, secondTech, job, people, service };
}
test("Technician accounts use explicit UUID links, enforce one-to-one assignment and retain audit across reconnects", (t) => {
  const f = fixture(t);
  assert.equal(f.service.technician(member), null);
  const linked = f.service.save(owner, f.tech, {
    userId: member.id,
    expectedVersion: 0,
  });
  assert.equal(linked.version, 1);
  assert.equal(f.service.technician(member).technician_id, f.tech);
  assert.equal(f.service.technician(other), null);
  assert.throws(
    () =>
      f.service.save(owner, f.secondTech, {
        userId: member.id,
        expectedVersion: 0,
      }),
    /already linked/,
  );
  assert.throws(
    () =>
      f.service.save(owner, f.tech, { userId: other.id, expectedVersion: 0 }),
    /changed/,
  );
  const second = openStorage(f.filename);
  try {
    const resumed = createServiceIdentity({
      storage: second,
      people: f.people,
    });
    assert.equal(resumed.technician(member).technician_id, f.tech);
    resumed.save(owner, f.tech, { userId: null, expectedVersion: 1 });
    assert.equal(f.service.technician(member), null);
    f.service.save(owner, f.secondTech, {
      userId: member.id,
      expectedVersion: 0,
    });
    assert.equal(f.service.technician(member).technician_id, f.secondTech);
  } finally {
    second.close();
  }
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM _service_identity_audit").get().n,
    3,
  );
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM technicians").get().n,
    2,
  );
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM jobs").get().n, 1);
});
test("HR and ordinary members cannot grant technician identity, and ineligible accounts never become authors", (t) => {
  const f = fixture(t);
  for (const user of [
    member,
    hr,
    viewer,
    { ...owner, active: false },
    { ...owner, mustChangePassword: true },
  ]) {
    assert.throws(() => f.service.configuration(user), /administrator/);
    assert.throws(
      () =>
        f.service.save(user, f.tech, { userId: member.id, expectedVersion: 0 }),
      /administrator/,
    );
  }
  assert.throws(
    () =>
      f.service.save(owner, f.tech, { userId: viewer.id, expectedVersion: 0 }),
    /active technician/,
  );
  f.db.prepare("UPDATE technicians SET active=0 WHERE id=?").run(f.tech);
  assert.throws(
    () =>
      f.service.save(owner, f.tech, { userId: member.id, expectedVersion: 0 }),
    /active technician/,
  );
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM _service_identity_audit").get().n,
    0,
  );
});
test("Execution author guard requires mapped active assignment or deliberate supervisor delegation", (t) => {
  const f = fixture(t);
  f.service.save(owner, f.tech, { userId: member.id, expectedVersion: 0 });
  assert.deepEqual(f.service.executionActor(member, f.job), {
    userId: member.id,
    technicianId: f.tech,
    delegated: false,
    reason: "",
  });
  for (const user of [
    other,
    hr,
    viewer,
    { ...member, active: false },
    { ...member, mustChangePassword: true },
    owner,
  ])
    assert.throws(
      () => f.service.executionActor(user, f.job),
      /required|cannot submit/,
    );
  const delegated = f.service.executionActor(
    owner,
    f.job,
    "Supervisor entering a paper report",
  );
  assert.equal(delegated.userId, owner.id);
  assert.equal(delegated.technicianId, f.tech);
  assert.equal(delegated.delegated, true);
  assert.throws(
    () =>
      f.service.executionActor(
        hr,
        f.job,
        "People administration is not service approval",
      ),
    /required/,
  );
  f.db.prepare("UPDATE technicians SET active=0 WHERE id=?").run(f.tech);
  assert.equal(f.service.technician(member), null);
  assert.throws(
    () => f.service.executionActor(member, f.job),
    /active technician/,
  );
  f.db.prepare("UPDATE jobs SET technician_id=NULL WHERE id=?").run(f.job);
  assert.throws(
    () =>
      f.service.executionActor(
        owner,
        f.job,
        "Supervisor attempted unassigned work",
      ),
    /active technician/,
  );
});
test("Mapping and audit writes roll back together on failure and protect retained historical identity", (t) => {
  const f = fixture(t);
  f.db.exec(
    "CREATE TRIGGER fail_identity_audit BEFORE INSERT ON _service_identity_audit BEGIN SELECT RAISE(ABORT,'audit failed'); END",
  );
  assert.throws(
    () =>
      f.service.save(owner, f.tech, { userId: member.id, expectedVersion: 0 }),
    /audit failed/,
  );
  assert.equal(f.service.technician(member), null);
  assert.equal(
    f.service
      .configuration(owner)
      .technicians.find((t) => t.technician_id === f.tech).version,
    0,
  );
  f.db.exec("DROP TRIGGER fail_identity_audit");
  f.service.save(owner, f.tech, { userId: member.id, expectedVersion: 0 });
  f.service.save(owner, f.tech, { userId: null, expectedVersion: 1 });
  assert.throws(
    () => f.db.prepare("DELETE FROM technicians WHERE id=?").run(f.tech),
    /FOREIGN KEY/,
  );
});
test("Technician identity HTTP rechecks current authorization after reading a request body", async (t) => {
  const f = fixture(t);
  let actor = owner;
  const { app } = createService({
    storage: f.storage,
    people: f.people,
    currentUser: () => actor,
  });
  actor = viewer;
  assert.equal((await app.request("/technician-users")).status, 403);
  assert.equal((await app.request("/my-technician")).status, 200);
  actor = owner;
  let release;
  const body = new ReadableStream({
    start(controller) {
      release = () => {
        controller.enqueue(
          new TextEncoder().encode(
            JSON.stringify({ userId: member.id, expectedVersion: 0 }),
          ),
        );
        controller.close();
      };
    },
  });
  const response = app.request(
    new Request("http://localhost/technician-users/" + f.tech, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "OpenFieldService",
      },
      body,
      duplex: "half",
    }),
  );
  actor = hr;
  release();
  assert.equal((await response).status, 403);
  assert.equal(f.service.technician(member), null);
  actor = owner;
  assert.equal(
    (
      await app.request("/technician-users/" + f.tech, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    403,
  );
});
