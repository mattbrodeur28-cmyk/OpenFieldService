import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openStorage } from "../src/server/sqlite.mjs";
import { createDispatcher } from "../src/server/dispatch/service.mjs";
import { installDispatch } from "../src/server/dispatch/storage.mjs";
async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "ofs-hours-")),
    storage = openStorage(join(dir, "service.sqlite")),
    db = storage.database;
  const customer = randomUUID(),
    tech = randomUUID();
  db.prepare("INSERT INTO customers(id,name) VALUES(?,?)").run(
    customer,
    "Shared customer",
  );
  db.prepare("INSERT INTO technicians(id,name) VALUES(?,?)").run(
    tech,
    "On-call technician",
  );
  let user = { id: "owner", role: "owner", active: true };
  const dispatch = createDispatcher({
    storage,
    env: { DISPATCH_TIMEZONE: "America/New_York" },
    currentUser: () => user,
  });
  t.after(() => {
    dispatch.close();
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });
  async function request(path, body, status = 200) {
    const response = await dispatch.app.request(path, {
      method: body ? "PUT" : "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "OpenFieldService",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    return result;
  }
  const job = () => {
    const id = randomUUID();
    db.prepare(
      "INSERT INTO jobs(id,identifier,customer_id,scheduled_date,scheduled_time,duration) VALUES(?,?,?,?,?,60)",
    ).run(id, "JOB-" + id, customer, "2026-11-16", "09:00");
    return id;
  };
  const assign = (id, time, version = 0, extra = {}, status = 200) =>
    request(
      "/assignments/" + id,
      {
        technicianId: tech,
        date: "2026-11-16",
        time,
        duration: 60,
        expectedVersion: version,
        ...extra,
      },
      status,
    );
  const config = await request("/operating-hours");
  const save = (extra = {}, status = 200) =>
    request(
      "/operating-hours",
      {
        enabled: true,
        expectedVersion: config.version,
        weekly: config.weekly,
        exceptions: config.exceptions,
        ...extra,
      },
      status,
    );
  return {
    db,
    storage,
    request,
    job,
    assign,
    save,
    config,
    tech,
    customer,
    setUser: (value) => {
      user = value;
    },
  };
}
test("Company hours reject normal 9PM work while explicit emergency approval remains visible and audited", async (t) => {
  const f = await fixture(t);
  const regular = f.job(),
    emergency = f.job();
  await f.save();
  await f.assign(regular, "21:00", 0, {}, 409);
  await f.assign(
    regular,
    "21:00",
    0,
    { override: true, reason: "Customer requested late work" },
    409,
  );
  await f.assign(emergency, "21:00", 0, { emergency: true }, 409);
  await f.assign(emergency, "21:00", 0, {
    emergency: true,
    override: true,
    reason: "Critical equipment failure after hours",
  });
  const board = await f.request("/board?date=2026-11-16");
  assert.equal(board.operatingHours.start, 480);
  assert.equal(board.timeZone, "America/New_York");
  assert.equal(board.jobs[0].outside_service_hours, true);
  assert.equal(board.jobs[0].is_emergency, 1);
  const audit = f.db
    .prepare("SELECT * FROM _dispatch_audit WHERE job_id=?")
    .get(emergency);
  assert.equal(JSON.parse(audit.after_json).is_emergency, 1);
  assert.equal(audit.reason, "Critical equipment failure after hours");
  await f.assign(regular, "08:00");
  assert.throws(
    () =>
      f.db
        .prepare("UPDATE jobs SET scheduled_time='22:00' WHERE id=?")
        .run(regular),
    /DISPATCH_SERVICE_HOURS/,
  );
  assert.throws(
    () =>
      f.db
        .prepare("UPDATE jobs SET scheduled_time='22:00' WHERE id=?")
        .run(emergency),
    /DISPATCH_SERVICE_HOURS/,
  );
  assert.throws(
    () =>
      f.db
        .prepare(
          "INSERT INTO jobs(id,identifier,customer_id,technician_id,scheduled_date,scheduled_time,duration) VALUES(?,?,?,?,?,'22:00',60)",
        )
        .run(randomUUID(), "LATE", f.customer, f.tech, "2026-11-16"),
    /DISPATCH_SERVICE_HOURS/,
  );
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM jobs").get().n, 2);
});
test("Weekly hours and dated exceptions use schedule-local dates, preserve existing work and reject stale configuration", async (t) => {
  const f = await fixture(t);
  const existing = f.job();
  await f.assign(existing, "21:00");
  await f.save({
    exceptions: [
      {
        date: "2026-11-17",
        label: "Holiday",
        open: false,
        start: 480,
        end: 1020,
      },
      {
        date: "2026-11-18",
        label: "Extended service",
        open: true,
        start: 360,
        end: 1380,
      },
    ],
  });
  const retained = await f.request("/board?date=2026-11-16");
  assert.equal(retained.jobs[0].id, existing);
  assert.equal(retained.jobs[0].outside_service_hours, true);
  assert.equal(
    (await f.request("/board?date=2026-11-17")).operatingHours.open,
    false,
  );
  assert.equal(
    (await f.request("/board?date=2026-11-18")).operatingHours.end,
    1380,
  );
  assert.equal(
    (await f.request("/board?date=2026-11-22")).operatingHours.open,
    false,
  );
  await f.save({}, 409);
  const next = f.job();
  await f.assign(next, "09:00", 0, { date: "2026-11-17" }, 409);
  await f.assign(next, "21:00", 0, { date: "2026-11-18" });
  assert.equal(
    (await f.request("/board?date=2026-11-18")).jobs[0].outside_service_hours,
    false,
  );
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM _dispatch_operating_audit").get().n,
    1,
  );
  installDispatch(f.db);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM jobs").get().n, 2);
});
test("Hours permissions, emergency override gates, invalid configuration and inactive actors fail without partial writes", async (t) => {
  const f = await fixture(t);
  const id = f.job();
  for (const patch of [
    { weekly: f.config.weekly.slice(1) },
    { weekly: f.config.weekly.map((d) => ({ ...d, weekday: 1 })) },
    {
      exceptions: [
        {
          date: "2026-02-30",
          label: "Invalid",
          open: false,
          start: 480,
          end: 1020,
        },
      ],
    },
    { weekly: f.config.weekly.map((d) => ({ ...d, start: 1200, end: 480 })) },
  ])
    await f.save(patch, 400);
  assert.equal(
    f.db.prepare("SELECT version FROM _dispatch_operating_settings").get()
      .version,
    0,
  );
  await f.save();
  f.setUser({ id: "hr", role: "member", active: true, hr: true });
  await f.save({ expectedVersion: 1 }, 403);
  await f.assign(
    id,
    "21:00",
    0,
    { emergency: true, override: true, reason: "Critical failure emergency" },
    403,
  );
  f.setUser({ id: "owner", role: "owner", active: false });
  await f.assign(id, "09:00", 0, {}, 401);
});

test("Native work categories preserve job identity and remain authoritative for emergency dispatch", async (t) => {
  const f = await fixture(t);
  const id = f.job();
  await f.assign(id, "09:00", 0, { workCategory: "pm" });
  let job = (await f.request("/board?date=2026-11-16")).jobs[0];
  assert.equal(job.id, id);
  assert.equal(job.work_category, "pm");
  assert.equal(job.is_emergency, 0);
  await f.assign(id, "09:00", job.schedule_version, { workCategory: "quoted" });
  job = (await f.request("/board?date=2026-11-16")).jobs[0];
  assert.equal(job.work_category, "quoted");
  assert.equal(job.is_emergency, 0);
  await f.assign(
    id,
    "09:00",
    job.schedule_version,
    { workCategory: "on_demand", emergency: false },
    400,
  );
  await f.assign(id, "09:00", job.schedule_version, {
    workCategory: "on_demand",
    emergency: true,
  });
  job = (await f.request("/board?date=2026-11-16")).jobs[0];
  assert.equal(job.work_category, "on_demand");
  assert.equal(job.is_emergency, 1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM jobs").get().n, 1);
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM _service_work_audit").get().n,
    3,
  );
  assert.equal(
    f.db.prepare("SELECT category FROM _service_work WHERE job_id=?").get(id)
      .category,
    "on_demand",
  );
});
