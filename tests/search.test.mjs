import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStorage } from "../src/server/sqlite.mjs";
import { globalSearch } from "../src/server/search.mjs";

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "ofs-search-")),
    storage = openStorage(join(dir, "s.sqlite")),
    db = storage.database;
  t.after(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { db };
}

test("global search matches native records across modules and ignores absent ones", (t) => {
  const { db } = setup(t);
  const customer = randomUUID();
  db.prepare("INSERT INTO customers(id,name,email,phone) VALUES(?,?,?,?)").run(customer, "Acme Mechanical", "acme@example.test", "555-0100");
  const asset = randomUUID();
  const site = randomUUID();
  db.prepare("INSERT INTO sites(id,customer_id,name) VALUES(?,?,?)").run(site, customer, "Acme HQ");
  db.prepare("INSERT INTO assets(id,customer_id,site_id,name,serial_number) VALUES(?,?,?,?,?)").run(asset, customer, site, "AHU-1", "SN-ACME-1");
  const job = randomUUID();
  db.prepare("INSERT INTO jobs(id,identifier,customer_id,status,scheduled_date) VALUES(?,?,?,'scheduled','2027-01-10')").run(job, "JOB-ACME-7", customer);

  const found = globalSearch(db, "acme");
  assert.equal(found.results.customers.length, 1);
  assert.equal(found.results.customers[0].name, "Acme Mechanical");
  assert.equal(found.results.equipment.length, 1);
  assert.equal(found.results.equipment[0].serialNumber, "SN-ACME-1");
  assert.equal(found.results.jobs.length, 1);
  assert.equal(found.results.opportunities, undefined);

  const byPhone = globalSearch(db, "555");
  assert.equal(byPhone.results.customers.length, 1);

  assert.deepEqual(globalSearch(db, "").results, {});
  assert.deepEqual(globalSearch(db, "zzz-no-match").results, { customers: [], jobs: [], equipment: [] });
});
