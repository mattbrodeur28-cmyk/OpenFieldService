import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStorage } from "../src/server/sqlite.mjs";
import { createCompanySettings } from "../src/server/service/company.mjs";
import { createDispatcher } from "../src/server/dispatch/service.mjs";
import { createService } from "../src/server/service/http.mjs";
import { zonedInput, zonedCandidates } from "../src/client/time-zone.mjs";
const owner = { id: randomUUID(), role: "owner", active: true };
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "ofs-company-")),
    path = join(dir, "test.sqlite"),
    storage = openStorage(path),
    company = createCompanySettings({
      storage,
      env: { COMPANY_TIMEZONE: "America/New_York" },
    });
  t.after(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { storage, company, path, db: storage.database };
}
const change = (expectedVersion, timeZone) => ({
  expectedVersion,
  timeZone,
  reason: "Company operating region changed after schedule review",
  acknowledgeScheduleTimes: true,
});
test("Company timezone persists per installation, updates running Dispatcher, audits atomically and rejects stale competing edits", async (t) => {
  const f = fixture(t),
    dispatcher = createDispatcher({
      storage: f.storage,
      env: { DISPATCH_TIMEZONE: "Europe/London" },
      currentUser: () => owner,
    });
  t.after(() => dispatcher.close());
  assert.equal(dispatcher.timeZone, "America/New_York");
  const peer = openStorage(f.path);
  t.after(() => peer.close());
  const settings = createCompanySettings({
    storage: peer,
    env: { COMPANY_TIMEZONE: "Asia/Tokyo" },
  });
  f.company.save(owner, change(0, "America/Chicago"));
  assert.equal(settings.read().timeZone, "America/Chicago");
  assert.equal(dispatcher.timeZone, "America/Chicago");
  assert.throws(
    () => settings.save(owner, change(0, "Europe/London")),
    (e) => e.status === 409,
  );
  const response = await dispatcher.app.request(
    "http://local/board?date=2026-11-16",
  );
  assert.equal((await response.json()).timeZone, "America/Chicago");
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM _company_settings_audit").get().n,
    1,
  );
  assert.ok(
    f.db.prepare("SELECT 1 FROM _dispatch_events WHERE kind='timezone'").get(),
  );
  f.db.exec(
    "CREATE TRIGGER fixture_audit_failure BEFORE INSERT ON _company_settings_audit BEGIN SELECT RAISE(ABORT,'fixture failure'); END;",
  );
  assert.throws(
    () => f.company.save(owner, change(1, "Europe/London")),
    /fixture failure/,
  );
  assert.equal(f.company.read().timeZone, "America/Chicago");
  assert.equal(f.company.read().version, 1);
});
test("Timezone changes require admin review and cannot introduce ambiguous active appointment times", (t) => {
  const f = fixture(t);
  for (const user of [
    { ...owner, role: "member", hr: true },
    { ...owner, role: "viewer" },
    { ...owner, active: false },
    { ...owner, mustChangePassword: true },
  ])
    assert.throws(
      () => f.company.save(user, change(0, "UTC")),
      (e) => e.status === 403,
    );
  for (const data of [
    { ...change(0, "UTC"), acknowledgeScheduleTimes: false },
    change(0, "Fake/Zone"),
    { ...change(0, "UTC"), reason: "short" },
  ])
    assert.throws(() => f.company.save(owner, data));
  const customer = randomUUID(),
    tech = randomUUID();
  f.db
    .prepare("INSERT INTO customers(id,name) VALUES(?,'Customer')")
    .run(customer);
  f.db.prepare("INSERT INTO technicians(id,name) VALUES(?,'Tech')").run(tech);
  f.db
    .prepare(
      "INSERT INTO jobs(id,identifier,customer_id,technician_id,scheduled_date,scheduled_time,duration) VALUES(?,'ZONE-JOB',?,?,'2026-11-01','01:30',30)",
    )
    .run(randomUUID(), customer, tech);
  // UTC is unambiguous; New York repeats 01:30 on this date.
  f.company.save(owner, change(0, "UTC"));
  assert.throws(
    () => f.company.save(owner, change(1, "America/New_York")),
    /ambiguous or invalid/,
  );
  assert.equal(f.company.read().timeZone, "UTC");
});
test("Company settings HTTP rechecks privileges after reading request bodies", async (t) => {
  const f = fixture(t);
  let user = owner;
  const module = createService({
    storage: f.storage,
    currentUser: () => user,
    people: () => [],
  });
  const read = await module.app.request("http://local/company");
  assert.equal((await read.json()).timeZone, "America/New_York");
  let release;
  const body = new ReadableStream({
    start(controller) {
      release = () => {
        controller.enqueue(
          new TextEncoder().encode(JSON.stringify(change(0, "UTC"))),
        );
        controller.close();
      };
    },
  });
  const response = module.app.request(
    new Request("http://local/company", {
      method: "PUT",
      headers: {
        "X-Requested-With": "OpenFieldService",
        "Content-Type": "application/json",
      },
      body,
      duplex: "half",
    }),
  );
  user = { ...owner, role: "member", hr: true };
  release();
  assert.equal((await response).status, 403);
  assert.equal(f.company.read().version, 0);
});
test("Company-time inputs are independent of the browser zone and distinguish DST gaps and repeated hours", () => {
  assert.equal(
    zonedInput("2026-11-15T02:21:00.000Z", "America/New_York"),
    "2026-11-14T21:21",
  );
  assert.equal(
    zonedInput("2026-11-15T02:21:00.000Z", "Asia/Kathmandu"),
    "2026-11-15T08:06",
  );
  assert.deepEqual(zonedCandidates("2026-03-08T02:30", "America/New_York"), []);
  assert.deepEqual(zonedCandidates("2026-11-01T01:30", "America/New_York"), [
    "2026-11-01T05:30:00.000Z",
    "2026-11-01T06:30:00.000Z",
  ]);
  assert.deepEqual(zonedCandidates("2026-11-15T08:06", "Asia/Kathmandu"), [
    "2026-11-15T02:21:00.000Z",
  ]);
  assert.deepEqual(zonedCandidates("2026-02-30T10:00", "UTC"), []);
});
