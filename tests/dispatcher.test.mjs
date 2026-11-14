import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { openStorage } from "../src/server/sqlite.mjs";
import { createDispatcher } from "../src/server/dispatch/service.mjs";
import { installDispatch } from "../src/server/dispatch/storage.mjs";
import {
  validDate,
  timeMinute,
  validZonedInterval,
  zonedDay,
} from "../src/server/dispatch/time.mjs";

test("Dispatcher serializes assignments, preserves jobs, enforces availability and audits deliberate overrides", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ofs-dispatch-")),
    filename = join(directory, "service.sqlite");
  const storage = openStorage(filename),
    db = storage.database;
  const customer = randomUUID(),
    a = randomUUID(),
    b = randomUUID(),
    inactive = randomUUID();
  db.prepare("INSERT INTO customers(id,name) VALUES(?,?)").run(
    customer,
    "Commercial customer",
  );
  for (const [id, name, active] of [
    [a, "Alex", 1],
    [b, "Blair", 1],
    [inactive, "Inactive", 0],
  ])
    db.prepare("INSERT INTO technicians(id,name,active) VALUES(?,?,?)").run(
      id,
      name,
      active,
    );
  const job = () => {
    const id = randomUUID();
    db.prepare(
      "INSERT INTO jobs(id,identifier,customer_id,scheduled_date,scheduled_time,duration) VALUES(?,?,?,?,?,?)",
    ).run(id, "JOB-" + id, customer, "2026-11-16", "09:00", 60);
    return id;
  };
  const first = job(),
    second = job(),
    third = job();
  let user = { id: "owner", role: "owner", active: true };
  const dispatch = createDispatcher({
    storage,
    env: { DISPATCH_TIMEZONE: "America/New_York" },
    currentUser: () => user,
  });
  const app = new Hono();
  app.route("/api/dispatch", dispatch.app);
  t.after(() => {
    dispatch.close();
    storage.close();
    rmSync(directory, { recursive: true, force: true });
  });
  async function request(
    path,
    body,
    status = 200,
    method = body ? "PUT" : "GET",
  ) {
    const response = await app.request("/api/dispatch" + path, {
      method,
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
  const assignment = (id, tech, time = "09:00", version = 0, extra = {}) =>
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
      extra.expectedStatus || 200,
    );
  const before = await request("/board?date=2026-11-16");
  assert.equal(before.pipelineTotal, 3);
  assert.equal(before.resources[0].availability, null);
  assert.equal((await assignment(first, a)).job.technician_id, a);
  await assignment(second, a, "09:30", 0, { expectedStatus: 409 });
  assert.equal(
    db.prepare("SELECT technician_id FROM jobs WHERE id=?").get(second)
      .technician_id,
    null,
  );
  assert.equal(
    db
      .prepare("SELECT managed FROM _dispatch_job_state WHERE job_id=?")
      .get(second).managed,
    0,
    "failed assignment rolls metadata back",
  );
  await assignment(first, b, "10:00", 0, { expectedStatus: 409 });
  await assignment(second, inactive, "09:00", 0, { expectedStatus: 400 });
  const competing = await Promise.all([
    app.request("/api/dispatch/assignments/" + second, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "OpenFieldService",
      },
      body: JSON.stringify({
        technicianId: b,
        date: "2026-11-16",
        time: "11:00",
        duration: 60,
        expectedVersion: 0,
      }),
    }),
    app.request("/api/dispatch/assignments/" + second, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "OpenFieldService",
      },
      body: JSON.stringify({
        technicianId: a,
        date: "2026-11-16",
        time: "12:00",
        duration: 60,
        expectedVersion: 0,
      }),
    }),
  ]);
  assert.deepEqual(
    competing.map((response) => response.status).sort(),
    [200, 409],
  );
  const profile = {
    date: "2026-11-16",
    expectedVersion: 0,
    dispatchTeam: "Commercial",
    territory: "North",
    skills: ["Controls", "HVAC"],
    availability: { available: true, start: 480, end: 1020 },
  };
  await request("/resources/" + a, profile);
  await assignment(third, a, "18:00", 0, { expectedStatus: 409 });
  user = { id: "member", role: "member", active: true };
  await assignment(third, a, "09:00", 0, {
    override: true,
    reason: "Owner requested double booking",
    expectedStatus: 403,
  });
  await request("/resources/" + a, { ...profile, expectedVersion: 1 }, 403);
  user = { id: "owner", role: "owner", active: true };
  const overridden = await assignment(third, a, "09:00", 0, {
    override: true,
    reason: "Approved paired commissioning work",
  });
  assert.equal(overridden.job.schedule_version, 1);
  const events = (await request("/audit")).events;
  assert.equal(events[0].action, "override");
  assert.match(events[0].reason, /Approved/);
  assert.throws(
    () =>
      db
        .prepare("UPDATE jobs SET scheduled_time='09:15' WHERE id=?")
        .run(third),
    /DISPATCH_OVERLAP/,
    "a legacy write cannot reuse a previous override for a new interval",
  );
  await request(
    "/resources/" + a,
    {
      ...profile,
      expectedVersion: 1,
      availability: { available: false, start: 0, end: 1440 },
    },
    409,
  );
  await assignment(third, null, "09:00", 1);
  db.prepare("UPDATE jobs SET status='completed' WHERE id=?").run(first);
  const state = storage.schedulingState(first);
  await assignment(first, b, "13:00", state.version, { expectedStatus: 409 });
  assert.throws(
    () =>
      db.prepare("UPDATE jobs SET status='scheduled' WHERE id=?").run(first),
    /DISPATCH_CLOSED/,
  );
  const snapshot = await request(
    "/board?date=2026-11-16&pipeline=open&search=Commercial",
  );
  assert.equal(snapshot.pipelineTotal, 2);
  assert.equal(
    snapshot.resources.find((resource) => resource.id === a).territory,
    "North",
  );
  user = { id: "viewer", role: "viewer", active: true };
  await request("/board?date=2026-11-16");
  await assignment(third, a, "15:00", 2, { expectedStatus: 403 });
  user = null;
  await request("/board?date=2026-11-16", undefined, 401);
  user = { id: "owner", role: "owner", active: true };
  installDispatch(db);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM jobs").get().n,
    3,
    "migration repeat preserves jobs",
  );
  const resumed = openStorage(filename);
  installDispatch(resumed.database);
  assert.equal(
    resumed.database.prepare("SELECT COUNT(*) AS n FROM _dispatch_audit").get()
      .n,
    4,
  );
  resumed.close();
});

test("Dispatcher timezone validation rejects invalid dates, repeated/gap times and DST-spanning intervals", () => {
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2026-02-28"), true);
  assert.equal(timeMinute("24:00"), null);
  assert.equal(
    validZonedInterval("2026-03-08", 150, 60, "America/New_York"),
    false,
  );
  assert.equal(
    validZonedInterval("2026-11-01", 90, 30, "America/New_York"),
    false,
  );
  assert.equal(
    validZonedInterval("2026-03-08", 90, 120, "America/New_York"),
    false,
  );
  assert.equal(
    validZonedInterval("2026-11-16", 540, 60, "America/New_York"),
    true,
  );
  assert.equal(validZonedInterval("2026-11-16", 1380, 60, "UTC"), true);
  assert.equal(
    zonedDay("America/Los_Angeles", new Date("2026-11-16T01:00:00Z")),
    "2026-11-15",
  );
});

test("Dispatcher protects overlapping writes from separate connections and resumes durable SSE revisions", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ofs-dispatch-concurrent-")),
    filename = join(directory, "service.sqlite");
  const one = openStorage(filename),
    db = one.database,
    customer = randomUUID(),
    tech = randomUUID(),
    jobs = [randomUUID(), randomUUID()];
  db.prepare("INSERT INTO customers(id,name) VALUES(?,?)").run(
    customer,
    "Concurrent customer",
  );
  db.prepare("INSERT INTO technicians(id,name) VALUES(?,?)").run(tech, "Alex");
  for (const id of jobs)
    db.prepare(
      "INSERT INTO jobs(id,identifier,customer_id,scheduled_date,scheduled_time,duration) VALUES(?,?,?,?,?,?)",
    ).run(id, id, customer, "2026-11-16", "09:00", 60);
  const two = openStorage(filename);
  let user = { id: "owner", role: "owner", active: true };
  const dispatches = [one, two].map((storage) =>
    createDispatcher({
      storage,
      env: { DISPATCH_TIMEZONE: "UTC" },
      currentUser: () => user,
    }),
  );
  const apps = dispatches.map((dispatch) => {
    const app = new Hono();
    app.route("/api/dispatch", dispatch.app);
    return app;
  });
  const readers = [];
  t.after(async () => {
    for (const dispatch of dispatches) dispatch.close();
    for (const reader of readers) await reader.cancel();
    one.close();
    two.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const before = await (
    await apps[0].request("/api/dispatch/board?date=2026-11-16")
  ).json();
  const responses = await Promise.all(
    apps.map((app, i) =>
      app.request("/api/dispatch/assignments/" + jobs[i], {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "OpenFieldService",
        },
        body: JSON.stringify({
          technicianId: tech,
          date: "2026-11-16",
          time: "09:00",
          duration: 60,
          expectedVersion: 0,
        }),
      }),
    ),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  const snapshot = await (
    await apps[1].request("/api/dispatch/board?date=2026-11-16")
  ).json();
  assert.equal(snapshot.jobs.length, 1);
  const stream = await apps[0].request("/api/dispatch/events", {
    headers: { "Last-Event-ID": String(before.revision) },
  });
  assert.match(stream.headers.get("content-type"), /event-stream/);
  const reader = stream.body.getReader();
  readers.push(reader);
  const read = async (r) => {
    const result = await r.read();
    return { done: result.done, text: new TextDecoder().decode(result.value) };
  };
  const event = await read(reader);
  assert.match(event.text, /event: schedule/);
  assert.match(event.text, new RegExp("id: " + snapshot.revision));
  assert.doesNotMatch(event.text, /Concurrent customer/);
  await reader.cancel();
  const resumed = await apps[1].request("/api/dispatch/events", {
      headers: { "Last-Event-ID": String(snapshot.revision) },
    }),
    resumedReader = resumed.body.getReader();
  readers.push(resumedReader);
  assert.match((await read(resumedReader)).text, /event: heartbeat/);
  db.prepare(
    "UPDATE jobs SET notes='Changed in another session' WHERE id=?",
  ).run(snapshot.jobs[0].id);
  assert.match((await read(resumedReader)).text, /event: schedule/);
  user = null;
  assert.equal(
    (await read(resumedReader)).done,
    true,
    "an open stream closes after session revocation",
  );
});

test("Dispatcher layout keeps adjacent appointments separate and stacks existing overlaps", async () => {
  const { layoutAppointments, overlapIds, shiftDate, dayInZone } = await import(
    "../src/client/dispatch-layout.mjs"
  );
  const common = {
    technician_id: "tech",
    scheduled_date: "2026-11-16",
    status: "scheduled",
    duration: 60,
  };
  const jobs = [
    { ...common, id: "a", scheduled_time: "09:00" },
    { ...common, id: "b", scheduled_time: "10:00" },
    { ...common, id: "c", scheduled_time: "09:30" },
  ];
  const layout = layoutAppointments(jobs);
  assert.equal(layout.lanes, 2);
  assert.equal(
    layout.items.find((item) => item.job.id === "a").lane,
    layout.items.find((item) => item.job.id === "b").lane,
  );
  assert.deepEqual([...overlapIds(jobs.slice(0, 2))], []);
  assert.equal(overlapIds(jobs).size, 3);
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
  assert.equal(
    dayInZone("America/Los_Angeles", new Date("2026-11-16T01:00:00Z")),
    "2026-11-15",
  );
});
