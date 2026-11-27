import {randomUUID} from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { openStorage } from "../src/server/sqlite.mjs";

test("standalone server preserves equipment workflows, restart data and live backups", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ofs-standalone-"));
  const database = join(directory, "data.sqlite");
  const socket = createServer().listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const env = { ...process.env, NODE_ENV: 'test', AUTH_TEST_MODE: '1', PORT: String(port), HOST: "127.0.0.1", DATABASE_PATH: database };
  const base = `http://127.0.0.1:${port}`;
  let server;
  async function stop() {
    if (!server || server.exitCode !== null) return;
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    const [code] = await exited;
    assert.equal(code, 0);
  }
  async function start() {
    server = spawn(process.execPath, ["--import", "tsx", "src/server/node.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
    let logs = "";
    server.stdout.on("data", (chunk) => { logs += chunk; });
    server.stderr.on("data", (chunk) => { logs += chunk; });
    for (let i = 0; i < 80; i++) {
      if (server.exitCode !== null) throw new Error(logs);
      try { if ((await fetch(base + "/healthz")).ok) return; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Startup timed out: " + logs);
  }
  t.after(async () => { await stop(); rmSync(directory, { recursive: true, force: true }); });
  async function api(method, path, body, expected = 200) {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", "X-Requested-With": "OpenFieldService" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    assert.equal(response.status, expected, text);
    return JSON.parse(text);
  }
  await start();
  const customer = await api("POST", "/api/customers", { name: "Commercial customer" }, 201);
  const site = await api("POST", `/api/customers/${customer.id}/sites`, { name: "Office", address: "1 Main St" }, 201);
  const asset = await api("POST", `/api/customers/${customer.id}/assets`, { name: "AHU-1", serial_number: "SN-1", site_id: site.id }, 201);
  const jobs = await Promise.all(Array.from({ length: 4 }, () => api("POST", "/api/jobs", { customer_id: customer.id, asset_id: asset.id, scheduled_date: "2026-11-14" }, 201)));
  assert.equal(new Set(jobs.map((job) => job.identifier)).size, 4);
  assert.equal(jobs[0].address, "1 Main St");
  await api("POST", `/api/jobs/${jobs[0].id}/notes`, { content: "Controls checkout" }, 201);
  const invoice = await api("POST", `/api/jobs/${jobs[0].id}/invoice`, undefined, 201);
  assert.ok(invoice.invoice_id);
  const directTech = await api("POST", "/api/technicians", {name:"Direct technician creation",email:"",phone:"",color:"#16a34a"}, 201);
  assert.ok(directTech.id);
  await api("DELETE", `/api/technicians/${directTech.id}`, undefined, 200);
  const staffId=randomUUID();
  const createdStaff=await api("POST","/api/hr/staff",{id:staffId,requestKey:randomUUID(),expectedVersion:0,name:"Dispatcher tech",email:"",phone:"",title:"Service technician",employmentStatus:"active",startDate:"",supervisorId:null,technician:true,color:"#16a34a",reason:"Reviewed technician hire for dispatch",acknowledgeOpenWork:false});
  assert.equal(createdStaff.staff.technician_id,staffId);
  const roster=await api("GET","/api/hr/staff");assert.ok(roster.rows.some(person=>person.id===staffId));
  const technician = {id:staffId};
  const original = (await api("GET", `/api/jobs/${jobs[0].id}`)).job;
  await api("PUT", `/api/dispatch/assignments/${jobs[0].id}`, {technicianId:technician.id,date:"2026-11-14",time:"09:00",duration:60,expectedVersion:original.schedule_version});
  const scheduled=(await api("GET", `/api/jobs/${jobs[0].id}`)).job;
  assert.equal(scheduled.dispatch_managed,1);
  await api("PUT", `/api/jobs/${jobs[0].id}`, {scheduled_time:"10:00"},409);
  await api("PUT", `/api/jobs/${jobs[0].id}`, {scheduled_time:"25:00",expected_version:scheduled.schedule_version},400);
  await api("PUT", `/api/jobs/${jobs[0].id}`, {scheduled_time:"10:00",expected_version:scheduled.schedule_version});
  await api("PUT", `/api/jobs/${jobs[0].id}`, {scheduled_time:"11:00",expected_version:scheduled.schedule_version},409);
  await api("PUT", `/api/dispatch/assignments/${jobs[1].id}`, {technicianId:technician.id,date:"2026-11-14",time:"10:30",duration:60,expectedVersion:0},409);
  assert.equal((await api("GET", "/api/dispatch/board?date=2026-11-14")).jobs[0].scheduled_time,"10:00");

  for (const path of ["/", `/assets/${asset.id}`, `/jobs/${jobs[0].id}`, "/schedule"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
  }
  assert.equal((await fetch(base + "/assets/missing.js")).status, 404);
  assert.equal((await fetch(base + "/api/does-not-exist")).status, 404);
  const index = await (await fetch(base)).text();
  const bundle = index.match(/src="([^\"]+\.js)"/)[1];
  assert.match((await fetch(base + bundle)).headers.get("content-type"), /javascript/);
  const backupFile = join(directory, "backup.sqlite");
  execFileSync(process.execPath, ["scripts/backup-db.mjs", backupFile], { env });
  const restored = new DatabaseSync(backupFile, { readOnly: true });
  assert.equal(restored.prepare("SELECT name FROM customers WHERE id = ?").get(customer.id).name, "Commercial customer");
  assert.equal(restored.prepare("SELECT COUNT(*) AS n FROM jobs").get().n, 4);
  assert.deepEqual(restored.prepare("PRAGMA foreign_key_check").all(), []);
  restored.close();
  assert.throws(() => execFileSync(process.execPath, ["scripts/backup-db.mjs", backupFile], { env, stdio: "pipe" }));
  await stop();
  await start();
  assert.equal((await api("GET", `/api/jobs/${jobs[0].id}`)).job.asset_id, asset.id);
  assert.ok((await api("GET", `/api/assets/${asset.id}/history`)).history.some((entry) => entry.details.includes("Controls checkout")));
});

test("standalone storage refuses legacy IDs without changing customer records", () => {
  const directory = mkdtempSync(join(tmpdir(), "ofs-legacy-"));
  try {
    const filename = join(directory, "legacy.sqlite");
    const db = new DatabaseSync(filename);
    db.exec(readFileSync(new URL("./fixtures/equipment-integer.sql", import.meta.url), "utf8"));
    db.exec("INSERT INTO customers(id, name) VALUES(1, 'Retain me')");
    db.close();
    assert.throws(() => openStorage(filename), /Legacy integer-ID/);
    const check = new DatabaseSync(filename);
    assert.equal(check.prepare("SELECT name FROM customers WHERE id=1").get().name, "Retain me");
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
