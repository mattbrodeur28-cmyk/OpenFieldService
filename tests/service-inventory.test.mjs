import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  fixture,
  owner,
  member,
  other,
  hr,
} from "./fixtures/service-execution.mjs";
import { openStorage } from "../src/server/sqlite.mjs";
import { createService } from "../src/server/service/http.mjs";
function setup(t, stock = 0) {
  const f = fixture(t),
    inv = f.module.inventory,
    material = randomUUID();
  f.db
    .prepare(
      "INSERT INTO materials(id,name,unit,unit_cost,in_stock) VALUES(?,'Stock relay','ea',12.5,?)",
    )
    .run(material, stock);
  const make = (code, kind = "warehouse", technicianId = null) =>
    inv.saveLocation(owner, {
      expectedVersion: 0,
      name: code,
      code,
      kind,
      technicianId,
      active: true,
      reason: "Reviewed stock location and custody setup",
    });
  const warehouse = make("WH-1"),
    truck = make("TRUCK-1", "truck", f.tech);
  const v = f.visit(undefined, undefined, false);
  f.reports.review(owner, v.id, {
    expectedVersion: 2,
    reportId: v.reportId,
    decision: "rejected",
    notes: "Return fixture to active post-work for tracked material entry",
  });
  return { ...f, inv, material, warehouse, truck, v };
}
const key = () => randomUUID(),
  note = "Reviewed physical stock movement and material evidence";
const receipt = (
  f,
  loc,
  quantityMilli,
  unitCostCents = 1250,
  opening = false,
) =>
  f.inv.post(owner, "receipt", {
    requestKey: key(),
    materialId: f.material,
    locationId: loc.id,
    quantityMilli,
    unitCostCents,
    expectedVersion:
      f.inv
        .detail(owner, loc.id)
        .stock.find((s) => s.material_id === f.material)?.version || 0,
    opening,
    reason: note,
  });
const qty = (f, loc) =>
  f.inv.detail(owner, loc.id).stock.find((s) => s.material_id === f.material)
    ?.quantity_milli || 0;
const ver = (f, loc) =>
  f.inv.detail(owner, loc.id).stock.find((s) => s.material_id === f.material)
    ?.version || 0;
const transfer = (f, q) =>
  f.inv.post(owner, "transfer", {
    requestKey: key(),
    materialId: f.material,
    fromLocationId: f.warehouse.id,
    toLocationId: f.truck.id,
    quantityMilli: q,
    expectedFromVersion: ver(f, f.warehouse),
    expectedToVersion: ver(f, f.truck),
    reason: note,
  });
test("Inventory adopts existing stock deliberately, transfers exact value and links technician usage/returns to native job materials", (t) => {
  const f = setup(t, 10.125);
  assert.throws(() => receipt(f, f.warehouse, 1000), /opening-balance/);
  assert.equal(
    f.db.prepare("SELECT in_stock FROM materials WHERE id=?").get(f.material)
      .in_stock,
    10.125,
  );
  assert.throws(() => receipt(f, f.warehouse, 10000, 1250, true), /must match/);
  receipt(f, f.warehouse, 10125, 1250, true);
  const moved = transfer(f, 2125);
  assert.equal(qty(f, f.warehouse), 8000);
  assert.equal(qty(f, f.truck), 2125);
  assert.equal(
    f.db
      .prepare(
        "SELECT SUM(quantity_delta) AS n FROM _inventory_legs WHERE movement_id=?",
      )
      .get(moved.movementId).n,
    0,
  );
  const request = {
    requestKey: key(),
    materialId: f.material,
    locationId: f.truck.id,
    quantityMilli: 1250,
    expectedVersion: ver(f, f.truck),
    jobId: f.v.id,
    reason: note,
  };
  const used = f.inv.post(member, "usage", request);
  const native = f.db
    .prepare("SELECT * FROM job_materials WHERE id=?")
    .get(used.jobMaterialId);
  assert.equal(native.job_id, f.v.id);
  assert.equal(native.material_id, f.material);
  assert.equal(native.quantity, 1.25);
  assert.equal(native.unit_cost, 12.5);
  assert.equal(qty(f, f.truck), 875);
  assert.equal(
    f.inv.post(member, "usage", request).jobMaterialId,
    used.jobMaterialId,
  );
  assert.equal(qty(f, f.truck), 875);
  const back = {
    requestKey: key(),
    jobMaterialId: used.jobMaterialId,
    toLocationId: f.truck.id,
    quantityMilli: 250,
    expectedUsageVersion: 1,
    expectedToVersion: ver(f, f.truck),
    reason: note,
  };
  f.inv.post(member, "return", back);
  assert.equal(
    f.db
      .prepare("SELECT quantity FROM job_materials WHERE id=?")
      .get(used.jobMaterialId).quantity,
    1,
  );
  assert.equal(f.inv.post(member, "return", back).replayed, true);
  assert.throws(
    () =>
      f.inv.post(member, "return", {
        ...back,
        requestKey: key(),
        quantityMilli: 1001,
        expectedUsageVersion: 2,
        expectedToVersion: ver(f, f.truck),
      }),
    /exceeds/,
  );
  f.inv.post(member, "return", {
    ...back,
    requestKey: key(),
    quantityMilli: 1000,
    expectedUsageVersion: 2,
    expectedToVersion: ver(f, f.truck),
  });
  assert.equal(qty(f, f.truck), 2125);
  assert.equal(
    f.db
      .prepare("SELECT quantity FROM job_materials WHERE id=?")
      .get(used.jobMaterialId).quantity,
    0,
  );
  assert.equal(
    f.db.prepare("SELECT in_stock FROM materials WHERE id=?").get(f.material)
      .in_stock,
    10.125,
  );
  assert.deepEqual(
    f.inv.jobUsage(member, f.v.id).usage.map((u) => u.returned_milli),
    [1250],
  );
  assert.throws(
    () =>
      f.db
        .prepare("UPDATE job_materials SET quantity=9 WHERE id=?")
        .run(used.jobMaterialId),
    /INVENTORY_USE_LEDGER/,
  );
  assert.throws(
    () =>
      f.db
        .prepare("DELETE FROM job_materials WHERE id=?")
        .run(used.jobMaterialId),
    /INVENTORY_USE_LEDGER/,
  );
  assert.throws(
    () =>
      f.db
        .prepare("UPDATE materials SET in_stock=99 WHERE id=?")
        .run(f.material),
    /INVENTORY_MANAGED_STOCK/,
  );
  assert.throws(
    () =>
      f.db
        .prepare("UPDATE materials SET unit='box' WHERE id=?")
        .run(f.material),
    /INVENTORY_MANAGED_UNIT/,
  );
});
test("Stock scopes follow live custody and active technician identity; HR cannot receive, count or reassign inventory", (t) => {
  const f = setup(t);
  receipt(f, f.warehouse, 3000);
  transfer(f, 2000);
  for (const u of [
    member,
    hr,
    { ...owner, role: "viewer" },
    { ...owner, active: false },
  ])
    assert.throws(
      () =>
        f.inv.post(u, "receipt", {
          requestKey: key(),
          materialId: f.material,
          locationId: f.truck.id,
          quantityMilli: 100,
          unitCostCents: 1000,
          expectedVersion: ver(f, f.truck),
          reason: note,
        }),
      (e) => e.status === 403,
    );
  assert.throws(
    () => f.inv.detail(other, f.truck.id),
    (e) => e.status === 403,
  );
  assert.throws(
    () =>
      f.inv.post(member, "transfer", {
        requestKey: key(),
        materialId: f.material,
        fromLocationId: f.warehouse.id,
        toLocationId: f.truck.id,
        quantityMilli: 100,
        expectedFromVersion: ver(f, f.warehouse),
        expectedToVersion: ver(f, f.truck),
        reason: note,
      }),
    (e) => e.status === 403,
  );
  const request = {
    requestKey: key(),
    materialId: f.material,
    locationId: f.truck.id,
    quantityMilli: 500,
    expectedVersion: ver(f, f.truck),
    jobId: f.v.id,
    reason: note,
  };
  f.inv.post(member, "usage", request);
  const changed = f.inv.saveLocation(owner, {
    id: f.truck.id,
    expectedVersion: 1,
    name: "TRUCK-1",
    code: "TRUCK-1",
    kind: "truck",
    technicianId: null,
    active: true,
    reason: "Truck returned to the company pending a new custodian",
  });
  assert.equal(changed.version, 2);
  assert.throws(
    () => f.inv.post(member, "usage", request),
    (e) => e.status === 403,
  );
  assert.throws(
    () =>
      f.inv.saveLocation(owner, {
        id: f.truck.id,
        expectedVersion: 2,
        name: "TRUCK-1",
        code: "TRUCK-1",
        kind: "truck",
        technicianId: null,
        active: false,
        reason: note,
      }),
    /Transfer all stock/,
  );
});
test("Competing connections reject stale/oversold transfers and idempotency keys cannot be reused with altered data", (t) => {
  const f = setup(t);
  receipt(f, f.warehouse, 1000);
  const peer = openStorage(f.path);
  t.after(() => peer.close());
  const module = createService({
    storage: peer,
    currentUser: () => owner,
    people: () => [{ id: owner.id, name: "Owner" }],
  });
  const request = {
    requestKey: key(),
    materialId: f.material,
    fromLocationId: f.warehouse.id,
    toLocationId: f.truck.id,
    quantityMilli: 750,
    expectedFromVersion: 1,
    expectedToVersion: 0,
    reason: note,
  };
  f.inv.post(owner, "transfer", request);
  assert.throws(
    () =>
      module.inventory.post(owner, "transfer", {
        ...request,
        requestKey: key(),
      }),
    /Insufficient|Stock changed/,
  );
  assert.equal(qty(f, f.warehouse), 250);
  assert.equal(qty(f, f.truck), 750);
  assert.equal(
    module.inventory.post(owner, "transfer", request).replayed,
    true,
  );
  assert.throws(
    () => f.inv.post(owner, "transfer", { ...request, quantityMilli: 100 }),
    /different stock data/,
  );
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM _inventory_movements").get().n,
    2,
  );
});
test("Count adjustments and latest-only reversals conserve retained valuation and preserve immutable evidence", (t) => {
  const f = setup(t);
  const first = receipt(f, f.warehouse, 2000, 1000);
  receipt(f, f.warehouse, 2000, 2000);
  assert.throws(
    () =>
      f.inv.post(owner, "reversal", {
        requestKey: key(),
        movementId: first.movementId,
        reason: note,
      }),
    /Later stock/,
  );
  const moved = transfer(f, 1000);
  const total = f.db
    .prepare(
      "SELECT value_millicents FROM _inventory_balances WHERE material_id=?",
    )
    .all(f.material)
    .reduce((n, r) => n + BigInt(r.value_millicents), 0n);
  assert.equal(total, 6000000n);
  f.inv.post(owner, "reversal", {
    requestKey: key(),
    movementId: moved.movementId,
    reason: note,
  });
  assert.equal(qty(f, f.truck), 0);
  assert.equal(qty(f, f.warehouse), 4000);
  assert.throws(
    () =>
      f.inv.post(owner, "reversal", {
        requestKey: key(),
        movementId: moved.movementId,
        reason: note,
      }),
    /already reversed/,
  );
  const adjusted = f.inv.post(owner, "adjustment", {
    requestKey: key(),
    materialId: f.material,
    locationId: f.warehouse.id,
    countedMilli: 3500,
    unitCostCents: 0,
    expectedVersion: ver(f, f.warehouse),
    reason: note,
    approved: true,
  });
  assert.equal(qty(f, f.warehouse), 3500);
  assert.equal(
    f.inv.detail(owner, f.warehouse.id).stock[0].value_millicents,
    "5250000",
  );
  f.inv.post(owner, "reversal", {
    requestKey: key(),
    movementId: adjusted.movementId,
    reason: note,
  });
  assert.equal(qty(f, f.warehouse), 4000);
  assert.equal(
    f.inv.detail(owner, f.warehouse.id).stock[0].value_millicents,
    "6000000",
  );
  assert.throws(
    () => f.db.prepare("UPDATE _inventory_movements SET reason='erased'").run(),
    /INVENTORY_EVIDENCE_IMMUTABLE/,
  );
  assert.throws(
    () => f.db.prepare("DELETE FROM _inventory_legs").run(),
    /INVENTORY_EVIDENCE_IMMUTABLE/,
  );
});
test("A failed movement leg rolls back adoption, balance projection, native usage and its evidence together", (t) => {
  const f = setup(t);
  f.db.exec(
    "CREATE TRIGGER fixture_leg_failure BEFORE INSERT ON _inventory_legs BEGIN SELECT RAISE(ABORT,'fixture ledger failure'); END;",
  );
  assert.throws(() => receipt(f, f.warehouse, 1000), /fixture ledger failure/);
  assert.equal(qty(f, f.warehouse), 0);
  assert.equal(
    f.db.prepare("SELECT in_stock FROM materials WHERE id=?").get(f.material)
      .in_stock,
    0,
  );
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM _inventory_materials").get().n,
    0,
  );
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM _inventory_movements").get().n,
    0,
  );
  f.db.exec("DROP TRIGGER fixture_leg_failure");
  receipt(f, f.truck, 1000);
  f.db.exec(
    "CREATE TRIGGER fixture_usage_failure BEFORE INSERT ON job_materials BEGIN SELECT RAISE(ABORT,'fixture usage failure'); END;",
  );
  assert.throws(
    () =>
      f.inv.post(member, "usage", {
        requestKey: key(),
        materialId: f.material,
        locationId: f.truck.id,
        quantityMilli: 500,
        expectedVersion: 1,
        jobId: f.v.id,
        reason: note,
      }),
    /fixture usage failure/,
  );
  assert.equal(qty(f, f.truck), 1000);
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM _inventory_job_usage").get().n,
    0,
  );
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM _inventory_movements").get().n,
    1,
  );
});
test("Inventory HTTP bounds payloads, requires a session/write header, and rechecks roles after an asynchronous body", async (t) => {
  const f = setup(t);
  let actor = owner;
  const { app } = createService({
    storage: f.storage,
    currentUser: () => actor,
    people: () => [{ id: owner.id, name: "Owner" }],
  });
  assert.equal((await app.request("/inventory")).status, 200);
  assert.equal(
    (
      await app.request("/inventory/movements/receipt", {
        method: "POST",
        body: "{}",
      })
    ).status,
    403,
  );
  let release;
  const pending = new ReadableStream({
    start(c) {
      release = () => {
        c.enqueue(
          new TextEncoder().encode(
            JSON.stringify({
              requestKey: key(),
              materialId: f.material,
              locationId: f.warehouse.id,
              quantityMilli: 1000,
              expectedVersion: 0,
              unitCostCents: 1250,
              reason: note,
            }),
          ),
        );
        c.close();
      };
    },
  });
  const response = app.request(
    new Request("http://local/inventory/movements/receipt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "OpenFieldService",
      },
      body: pending,
      duplex: "half",
    }),
  );
  actor = hr;
  release();
  assert.equal((await response).status, 403);
  assert.equal(qty(f, f.warehouse), 0);
  actor = null;
  assert.equal((await app.request("/inventory")).status, 401);
});

test(
  "Separate Node processes competing for the same stock cannot both consume it",
  { timeout: 15000 },
  async (t) => {
    const { spawn } = await import("node:child_process");
    const f = setup(t);
    receipt(f, f.warehouse, 1000);
    const request = () => ({
      requestKey: key(),
      materialId: f.material,
      fromLocationId: f.warehouse.id,
      toLocationId: f.truck.id,
      quantityMilli: 750,
      expectedFromVersion: 1,
      expectedToVersion: 0,
      reason: note,
    });
    function worker() {
      const child = spawn(
        process.execPath,
        [
          new URL("./fixtures/inventory-worker.mjs", import.meta.url).pathname,
          f.path,
          owner.id,
          JSON.stringify(request()),
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      t.after(() => {
        if (child.exitCode === null) child.kill();
      });
      let buffer = "",
        errors = "",
        readyResolve,
        readyReject,
        doneResolve,
        doneReject;
      const ready = new Promise((resolve, reject) => {
          readyResolve = resolve;
          readyReject = reject;
        }),
        done = new Promise((resolve, reject) => {
          doneResolve = resolve;
          doneReject = reject;
        });
      child.stderr.on("data", (b) => {
        errors += b;
      });
      child.stdout.on("data", (b) => {
        buffer += b;
        while (buffer.includes("\n")) {
          const end = buffer.indexOf("\n"),
            line = buffer.slice(0, end);
          buffer = buffer.slice(end + 1);
          if (line === "READY") readyResolve();
          else {
            try {
              doneResolve(JSON.parse(line));
            } catch (e) {
              doneReject(e);
            }
          }
        }
      });
      child.on("error", (e) => {
        readyReject(e);
        doneReject(e);
      });
      child.on("exit", (code) => {
        if (code !== 0) {
          const error = Error("Stock worker failed: " + errors);
          readyReject(error);
          doneReject(error);
        }
      });
      return { child, ready, done };
    }
    const a = worker(),
      b = worker();
    await Promise.all([a.ready, b.ready]);
    a.child.stdin.write("go\n");
    b.child.stdin.write("go\n");
    const results = await Promise.all([a.done, b.done]);
    assert.equal(results.filter((r) => r.ok).length, 1);
    assert.equal(results.find((r) => !r.ok).status, 409);
    assert.equal(qty(f, f.warehouse), 250);
    assert.equal(qty(f, f.truck), 750);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) AS n FROM _inventory_movements").get().n,
      2,
    );
  },
);

test("Completed-job returns require supervisor review and invalidate native billing drafts without erasing usage", (t) => {
  const f = setup(t);
  receipt(f, f.warehouse, 2000);
  transfer(f, 2000);
  const used = f.inv.post(member, "usage", {
    requestKey: key(),
    materialId: f.material,
    locationId: f.truck.id,
    quantityMilli: 1000,
    expectedVersion: ver(f, f.truck),
    jobId: f.v.id,
    reason: note,
  });
  f.db
    .prepare(
      "INSERT INTO _service_work(job_id,category,updated_by) VALUES(?,'on_demand',?)",
    )
    .run(f.v.id, owner.id);
  const report = f.reports.save(
    owner,
    f.v.id,
    {
      expectedVersion: 3,
      delegationReason:
        "Supervisor entering fixture report after tracked material use",
      lateEntryReason:
        "Historical fixture evidence retained without backdating safety",
      report: f.v.report,
    },
    true,
  );
  f.reports.review(owner, f.v.id, {
    expectedVersion: 4,
    reportId: report.reports[0].id,
    decision: "approved",
    notes: "Completed fixture evidence and material review",
  });
  const source = f.module.billing.detail(owner, f.v.id);
  f.module.billing.save(owner, f.v.id, {
    expectedVersion: 0,
    sourceToken: source.sourceToken,
    currency: "USD",
    labor: source.labor.map((e) => ({
      sourceId: e.id,
      rateCents: 10000,
      billableMinutes: e.requested_billable_minutes,
      reason: "",
    })),
    materials: source.materials.map((m) => ({
      sourceId: m.id,
      rateCents: 2500,
      reason: "",
    })),
    taxBasisPoints: 0,
    notes: "",
  });
  const back = {
    requestKey: key(),
    jobMaterialId: used.jobMaterialId,
    toLocationId: f.warehouse.id,
    quantityMilli: 500,
    expectedUsageVersion: 1,
    expectedToVersion: ver(f, f.warehouse),
    reason: note,
    delegationReason:
      "Supervisor reviewed a return from completed fixture work",
  };
  assert.throws(() => f.inv.post(member, "return", back), /post-work step/);
  f.inv.post(owner, "return", back);
  assert.equal(f.module.billing.detail(owner, f.v.id).draft.stale, true);
  assert.equal(
    f.module.billing.detail(owner, f.v.id).materials[0].quantity,
    0.5,
  );
  f.inv.post(owner, "return", {
    ...back,
    requestKey: key(),
    expectedUsageVersion: 2,
    expectedToVersion: ver(f, f.warehouse),
  });
  assert.equal(f.module.billing.detail(owner, f.v.id).materials.length, 0);
  assert.equal(f.inv.jobUsage(member, f.v.id).usage[0].returned_milli, 1000);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM invoices").get().n, 0);
});
test("Reorder policy has independent audit/version checks and history pagination retains every movement", (t) => {
  const f = setup(t);
  const first = receipt(f, f.warehouse, 1000);
  const b = f.inv.policy(owner, {
    locationId: f.warehouse.id,
    materialId: f.material,
    expectedVersion: 1,
    reorderMilli: 1500,
    reason: note,
  });
  assert.equal(b.quantity_milli, 1000);
  assert.equal(b.reorder_milli, 1500);
  assert.equal(b.version, 2);
  assert.throws(
    () =>
      f.inv.policy(owner, {
        locationId: f.warehouse.id,
        materialId: f.material,
        expectedVersion: 1,
        reorderMilli: 0,
        reason: note,
      }),
    /policy changed/,
  );
  assert.throws(
    () =>
      f.inv.post(owner, "reversal", {
        requestKey: key(),
        movementId: first.movementId,
        reason: note,
      }),
    /Later stock or policy/,
  );
  for (let i = 0; i < 100; i++) receipt(f, f.warehouse, 1, 0);
  const page1 = f.inv.detail(owner, f.warehouse.id),
    page2 = f.inv.detail(owner, f.warehouse.id, 2);
  assert.equal(page1.history.length, 100);
  assert.equal(page1.hasMoreHistory, true);
  assert.equal(page2.history.length, 1);
  assert.equal(page2.hasMoreHistory, false);
  assert.equal(
    new Set([...page1.history, ...page2.history].map((m) => m.id)).size,
    101,
  );
  assert.equal(
    f.db
      .prepare(
        "SELECT COUNT(*) AS n FROM _inventory_audit WHERE action='reorder_policy'",
      )
      .get().n,
    1,
  );
  assert.throws(
    () => f.inv.detail(owner, f.warehouse.id, 0),
    /valid inventory history/,
  );
});


test("Company-wide weighted-average costs cross warehouse/truck boundaries and returns retain original job cost", (t) => {
  const f = setup(t);
  receipt(f, f.truck, 10000, 1000);
  const oldTruckVersion = ver(f, f.truck);
  receipt(f, f.warehouse, 10000, 3000);
  assert.ok(ver(f, f.truck) > oldTruckVersion, "other-location repricing invalidates old versions");
  assert.equal(f.inv.detail(owner, f.truck.id).stock[0].company_unit_cost_cents, 2000);
  const used = f.inv.post(member, "usage", {
    requestKey: key(), materialId: f.material, locationId: f.truck.id,
    quantityMilli: 5000, expectedVersion: ver(f, f.truck), jobId: f.v.id, reason: note,
  });
  assert.equal(f.db.prepare("SELECT unit_cost FROM job_materials WHERE id=?").get(used.jobMaterialId).unit_cost, 20);
  const purchased = receipt(f, f.warehouse, 5000, 4000);
  assert.equal(f.inv.detail(owner, f.truck.id).stock[0].company_unit_cost_cents, 2500);
  // Later purchases do not change the original job's cost snapshot.
  assert.equal(f.db.prepare("SELECT unit_cost FROM job_materials WHERE id=?").get(used.jobMaterialId).unit_cost, 20);
  f.inv.post(member, "return", {
    requestKey: key(), jobMaterialId: used.jobMaterialId, toLocationId: f.truck.id,
    quantityMilli: 2000, expectedUsageVersion: 1, expectedToVersion: ver(f, f.truck), reason: note,
  });
  const rows = f.db.prepare("SELECT * FROM _inventory_balances WHERE material_id=?").all(f.material);
  assert.equal(rows.reduce((n, row) => n + row.quantity_milli, 0), 22000);
  assert.equal(rows.reduce((n, row) => n + BigInt(row.value_millicents), 0n), 54000000n);
  assert.equal(f.inv.detail(owner, f.truck.id).stock[0].company_unit_cost_cents, 2455);
  assert.throws(() => f.inv.post(owner, "reversal", { requestKey: key(), movementId: purchased.movementId, reason: note }), /Later stock/);
  assert.throws(() => f.db.prepare("DELETE FROM _inventory_valuations").run(), /IMMUTABLE/);
});

test("Company repricing rolls back every location and retained valuation on failure", (t) => {
  const f = setup(t);
  receipt(f, f.truck, 1001, 1234);
  receipt(f, f.warehouse, 2003, 5678);
  const snapshot = () => f.db.prepare("SELECT * FROM _inventory_balances ORDER BY location_id,material_id").all();
  const before = snapshot();
  f.db.exec("CREATE TRIGGER fixture_valuation_failure BEFORE INSERT ON _inventory_valuations BEGIN SELECT RAISE(ABORT,'fixture valuation failure'); END;");
  assert.throws(() => receipt(f, f.warehouse, 333, 9999), /fixture valuation failure/);
  assert.deepEqual(snapshot(), before);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM _inventory_movements").get().n, 2);
});
