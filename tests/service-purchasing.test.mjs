import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { owner, member, hr } from "./fixtures/service-execution.mjs";
import { setup, act, issue, receipt, reason } from "./fixtures/purchasing.mjs";
test("Native supplier and PO approval/issue retain terms and source identity; receiving partials changes the shared company cost", (t) => {
  const f = setup(t);
  assert.equal(f.p.options(owner).locations[0].id, f.place.id);
  assert.equal(f.p.list(owner).orders[0].totalCents, 11225);
  assert.equal(f.p.saveOrder(owner, f.draft).replayed, true);
  assert.equal(f.p.list(owner).orders.length, 1);
  issue(f);
  const request = receipt(f, 4000);
  const first = f.p.receive(owner, request);
  assert.equal(first.status, "partially_received");
  assert.equal(f.p.receive(owner, request).receiptId, first.receiptId);
  assert.equal(f.inv.detail(owner, f.place.id).stock[0].quantity_milli, 4000);
  f.p.receive(owner, receipt(f, 6000, 2000));
  const d = f.p.detail(owner, f.draft.id);
  assert.equal(d.order.status, "received");
  assert.equal(d.lines[0].remaining_milli, 0);
  assert.equal(d.receipts.length, 2);
  assert.equal(
    f.inv.detail(owner, f.place.id).history[0].purchase_order_id,
    f.draft.id,
  );
  assert.equal(d.issued.snapshot.lines[0].unit_cost_cents, 1000);
  assert.equal(d.issued.snapshot.supplier.name, "Test supplier");
  assert.equal(
    f.inv.detail(owner, f.place.id).stock[0].company_unit_cost_cents,
    1600,
  );
  assert.equal(
    f.db.prepare("SELECT in_stock FROM materials WHERE id=?").get(f.material)
      .in_stock,
    10,
  );
  assert.throws(
    () =>
      f.inv.post(owner, "reversal", {
        requestKey: randomUUID(),
        movementId: d.receipts[0].movement_id,
        reason,
      }),
    /PURCH_RECEIPT_USE_RETURN/,
  );
  assert.equal(f.inv.detail(owner, f.place.id).stock[0].quantity_milli, 10000);
});
test("Purchasing rejects unauthorized roles, stale approvals, altered replays, unapproved overages and silently changed units", (t) => {
  const f = setup(t);
  for (const user of [
    member,
    hr,
    { ...owner, active: false },
    { ...owner, mustChangePassword: true },
  ])
    assert.throws(() => f.p.list(user), /administrator/);
  assert.throws(
    () => f.p.saveSupplier(owner, { ...f.vendor, name: "Different data" }),
    /different purchasing/,
  );
  act(f, "approve");
  f.db
    .prepare("UPDATE materials SET name='Renamed relay' WHERE id=?")
    .run(f.material);
  assert.throws(() => act(f, "issue"), /changed since approval/);
  act(f, "return_to_draft");
  issue(f);
  f.db.prepare("UPDATE materials SET unit='box' WHERE id=?").run(f.material);
  assert.throws(() => f.p.receive(owner, receipt(f)), /unit changed/);
  f.db.prepare("UPDATE materials SET unit='ea' WHERE id=?").run(f.material);
  assert.throws(() => f.p.receive(owner, receipt(f, 11000)), /Over-receipt/);
  assert.throws(
    () =>
      f.p.receive(owner, receipt(f, 1000, 2000, { priceVarianceReason: "" })),
    /price variance/,
  );
  f.p.receive(
    owner,
    receipt(f, 11000, 1000, {
      approveOverReceipt: true,
      overReceiptReason: "Reviewed extra stock supplied against this PO",
    }),
  );
  assert.equal(f.p.detail(owner, f.draft.id).lines[0].received_milli, 11000);
  assert.throws(
    () =>
      f.p.saveOrder(owner, {
        ...f.draft,
        requestKey: randomUUID(),
        expectedVersion: 4,
      }),
    /changed|Only a draft/,
  );
  assert.throws(
    () =>
      f.db
        .prepare("UPDATE _purch_lines SET quantity_milli=1 WHERE id=?")
        .run(f.lineId),
    /TERMS_LOCKED/,
  );
});
test("Rejected goods do not enter stock; closing releases outstanding commitment without erasing receipt evidence", (t) => {
  const f = setup(t);
  issue(f);
  f.p.receive(
    owner,
    receipt(f, 0, 1000, { deliveredMilli: 2000, rejectedMilli: 2000 }),
  );
  assert.equal(f.p.detail(owner, f.draft.id).order.status, "issued");
  assert.equal(f.p.detail(owner, f.draft.id).receipts[0].movement_id, null);
  assert.equal(f.inv.detail(owner, f.place.id).stock.length, 0);
  f.p.receive(owner, receipt(f, 3000));
  assert.throws(() => act(f, "cancel"), /cannot be cancelled/);
  act(f, "close");
  assert.equal(f.p.detail(owner, f.draft.id).lines[0].remaining_milli, 7000);
  assert.throws(() => f.p.receive(owner, receipt(f, 1000)), /issued open/);
  assert.throws(
    () => f.db.prepare("DELETE FROM _purch_receipts").run(),
    /IMMUTABLE/,
  );
  assert.throws(
    () => f.db.prepare("UPDATE _purch_issues SET snapshot_json=?").run("{}"),
    /IMMUTABLE/,
  );
});
test("A failed purchasing evidence insert rolls back PO receipt, inventory adoption, repricing, requests and quantities", (t) => {
  const f = setup(t);
  issue(f);
  f.db.exec(
    "CREATE TRIGGER fixture_po_failure BEFORE INSERT ON _purch_receipts BEGIN SELECT RAISE(ABORT,'fixture PO receipt failure'); END;",
  );
  const request = receipt(f);
  assert.throws(
    () => f.p.receive(owner, request),
    /fixture PO receipt failure/,
  );
  assert.equal(f.p.detail(owner, f.draft.id).order.version, 3);
  assert.equal(f.p.detail(owner, f.draft.id).receipts.length, 0);
  assert.equal(f.inv.detail(owner, f.place.id).stock.length, 0);
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM _inventory_movements").get().n,
    0,
  );
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM _inventory_materials").get().n,
    0,
  );
  assert.equal(
    f.db
      .prepare("SELECT COUNT(*) AS n FROM _purch_requests WHERE request_key=?")
      .get(request.requestKey).n,
    0,
  );
  f.db.exec("DROP TRIGGER fixture_po_failure");
  f.p.receive(owner, request);
  assert.equal(f.inv.detail(owner, f.place.id).stock[0].quantity_milli, 4000);
});

test(
  "Independent receivers cannot both receive the same remaining PO quantity",
  { timeout: 15000 },
  async (t) => {
    const { spawn } = await import("node:child_process");
    const f = setup(t);
    issue(f);
    function worker() {
      const child = spawn(
        process.execPath,
        [
          new URL("./fixtures/purchasing-worker.mjs", import.meta.url).pathname,
          f.path,
          owner.id,
          JSON.stringify(receipt(f, 7000)),
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
          const error = Error("Purchasing worker failed: " + errors);
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
    const d = f.p.detail(owner, f.draft.id);
    assert.equal(d.lines[0].received_milli, 7000);
    assert.equal(d.receipts.length, 1);
    assert.equal(f.inv.detail(owner, f.place.id).stock[0].quantity_milli, 7000);
  },
);

test("PO purchases retain native job cost after a later price change and company repricing", (t) => {
  const f = setup(t),
    v = f.visit(undefined, undefined, false);
  f.reports.review(owner, v.id, {
    expectedVersion: 2,
    reportId: v.reportId,
    decision: "rejected",
    notes: "Return fixture to post-work for stock recording",
  });
  f.p.saveOrder(owner, {
    ...f.draft,
    requestKey: randomUUID(),
    expectedVersion: 1,
    lines: [{ ...f.draft.lines[0], jobId: v.id }],
  });
  issue(f);
  f.p.receive(owner, receipt(f, 4000));
  const truck = f.inv.saveLocation(owner, {
    expectedVersion: 0,
    name: "Job truck",
    code: "JOBTRUCK",
    kind: "truck",
    technicianId: f.tech,
    active: true,
    reason,
  });
  f.inv.post(owner, "transfer", {
    requestKey: randomUUID(),
    materialId: f.material,
    fromLocationId: f.place.id,
    toLocationId: truck.id,
    quantityMilli: 2000,
    expectedFromVersion: 1,
    expectedToVersion: 0,
    reason,
  });
  const used = f.inv.post(member, "usage", {
    requestKey: randomUUID(),
    materialId: f.material,
    locationId: truck.id,
    quantityMilli: 1000,
    expectedVersion: 1,
    jobId: v.id,
    reason,
  });
  assert.equal(
    f.db
      .prepare("SELECT unit_cost FROM job_materials WHERE id=?")
      .get(used.jobMaterialId).unit_cost,
    10,
  );
  f.p.receive(owner, receipt(f, 6000, 2000));
  assert.equal(
    f.inv.detail(owner, truck.id).stock[0].company_unit_cost_cents,
    1667,
  );
  assert.equal(
    f.db
      .prepare("SELECT unit_cost FROM job_materials WHERE id=?")
      .get(used.jobMaterialId).unit_cost,
    10,
  );
  const d = f.p.detail(owner, f.draft.id);
  assert.equal(d.lines[0].job_id, v.id);
  assert.equal(d.totals.acceptedMaterialCents, 16000);
  assert.equal(d.totals.openMaterialCents, 0);
});

test("Legacy opening adoption and final request-journal failure cannot leave a partially received PO", (t) => {
  const f = setup(t);
  issue(f);
  f.db.prepare("UPDATE materials SET in_stock=2 WHERE id=?").run(f.material);
  assert.throws(() => f.p.receive(owner, receipt(f, 1000)), /opening-balance/);
  assert.equal(f.p.detail(owner, f.draft.id).receipts.length, 0);
  f.inv.post(owner, "receipt", {
    requestKey: randomUUID(),
    materialId: f.material,
    locationId: f.place.id,
    quantityMilli: 2000,
    unitCostCents: 3000,
    expectedVersion: 0,
    opening: true,
    reason,
  });
  const request = receipt(f, 1000);
  f.db.exec(
    "CREATE TRIGGER fixture_purchase_ack_failure BEFORE INSERT ON _purch_requests BEGIN SELECT RAISE(ABORT,'fixture acknowledgement failure'); END;",
  );
  assert.throws(() => f.p.receive(owner, request), /acknowledgement failure/);
  assert.equal(f.p.detail(owner, f.draft.id).order.version, 3);
  assert.equal(f.p.detail(owner, f.draft.id).receipts.length, 0);
  assert.equal(f.inv.detail(owner, f.place.id).stock[0].quantity_milli, 2000);
  f.db.exec("DROP TRIGGER fixture_purchase_ack_failure");
  f.p.receive(owner, request);
  assert.equal(
    f.inv.detail(owner, f.place.id).stock[0].company_unit_cost_cents,
    2333,
  );
});

test("Purchasing HTTP rejects missing sessions, write headers, malformed bodies and role changes during body reads", async (t) => {
  const { createService } = await import("../src/server/service/http.mjs");
  const f = setup(t);
  let actor = owner;
  const { app } = createService({
    storage: f.storage,
    currentUser: () => actor,
    people: () => [{ id: owner.id, name: "Owner" }],
  });
  const url = "/purchasing/suppliers",
    headers = {
      "Content-Type": "application/json",
      "X-Requested-With": "OpenFieldService",
    };
  assert.equal(
    (await app.request(url, { method: "POST", body: "{}" })).status,
    403,
  );
  assert.equal(
    (await app.request(url, { method: "POST", headers, body: "invalid json" }))
      .status,
    400,
  );
  assert.equal(
    (
      await app.request(url, {
        method: "POST",
        headers,
        body: "x".repeat(50001),
      })
    ).status,
    413,
  );
  let release;
  const body = new ReadableStream({
    start(c) {
      release = () => {
        c.enqueue(
          new TextEncoder().encode(
            JSON.stringify({
              ...f.vendor,
              requestKey: randomUUID(),
              expectedVersion: 1,
              name: "Unauthorized rename",
            }),
          ),
        );
        c.close();
      };
    },
  });
  const pending = app.request(
    new Request("http://local" + url, {
      method: "POST",
      headers,
      body,
      duplex: "half",
    }),
  );
  actor = hr;
  release();
  assert.equal((await pending).status, 403);
  actor = null;
  assert.equal((await app.request("/purchasing/orders")).status, 401);
  assert.equal(f.p.options(owner).suppliers[0].name, "Test supplier");
});
