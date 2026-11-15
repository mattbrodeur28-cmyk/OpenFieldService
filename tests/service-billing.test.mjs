import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture, owner, member, hr } from "./fixtures/service-execution.mjs";
import { calculateBilling } from "../src/server/service/billing.mjs";
function setup(t) {
  const f = fixture(t),
    v = f.visit();
  f.db
    .prepare(
      "INSERT INTO _service_work(job_id,category,updated_by) VALUES(?,'on_demand',?)",
    )
    .run(v.id, owner.id);
  const material = randomUUID(),
    usage = randomUUID();
  f.db
    .prepare(
      "INSERT INTO materials(id,name,unit_cost) VALUES(?,'Control relay',12.5)",
    )
    .run(material);
  f.db
    .prepare(
      "INSERT INTO job_materials(id,job_id,material_id,quantity,unit_cost) VALUES(?,?,?,1.25,12.5)",
    )
    .run(usage, v.id, material);
  const source = f.module.billing.detail(owner, v.id);
  const input = {
    expectedVersion: 0,
    sourceToken: source.sourceToken,
    currency: "USD",
    labor: source.labor.map((e) => ({
      sourceId: e.id,
      rateCents: 15000,
      billableMinutes: e.requested_billable_minutes,
      reason: "",
    })),
    materials: [{ sourceId: usage, rateCents: 2500, reason: "" }],
    taxBasisPoints: 725,
    notes: "Reviewable draft; no accounting posting",
  };
  return { ...f, v, usage, source, input };
}
test("On-Demand billing uses retained labor IDs and explicit selling prices with exact cent rounding", (t) => {
  const f = setup(t);
  assert.equal(f.source.blockers.length, 0);
  const saved = f.module.billing.save(owner, f.v.id, f.input);
  assert.equal(saved.draft.version, 1);
  assert.equal(saved.draft.data.subtotalCents, 13125);
  assert.equal(saved.draft.data.taxCents, 952);
  assert.equal(saved.draft.data.totalCents, 14077);
  assert.equal(saved.draft.data.lines[1].rateCents, 2500);
  assert.equal(saved.materials[0].unit_cost, 12.5);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM invoices").get().n, 0);
  assert.equal(
    f.db
      .prepare("SELECT stage FROM _service_execution WHERE job_id=?")
      .get(f.v.id).stage,
    "review",
  );
});
test("Billing draft rejects stale source/version, duplicate IDs, excessive billing and unexplained overrides", (t) => {
  const f = setup(t);
  for (const input of [
    { ...f.input, labor: [f.input.labor[0], f.input.labor[0]] },
    { ...f.input, labor: [{ ...f.input.labor[0], billableMinutes: 51 }] },
    { ...f.input, labor: [{ ...f.input.labor[0], billableMinutes: 45 }] },
    { ...f.input, materials: [{ ...f.input.materials[0], rateCents: 0 }] },
  ])
    assert.throws(() => f.module.billing.save(owner, f.v.id, input));
  f.module.billing.save(owner, f.v.id, f.input);
  assert.throws(
    () => f.module.billing.save(owner, f.v.id, f.input),
    /draft changed/,
  );
  f.db.prepare("UPDATE job_materials SET quantity=2 WHERE id=?").run(f.usage);
  assert.equal(f.module.billing.detail(owner, f.v.id).draft.stale, true);
  assert.throws(
    () =>
      f.module.billing.save(owner, f.v.id, { ...f.input, expectedVersion: 1 }),
    /sources changed/,
  );
});
test("Billing permissions, category/evidence blockers and failed audit preserve the complete transaction", (t) => {
  const f = setup(t);
  for (const u of [
    member,
    hr,
    { ...owner, active: false },
    { ...owner, mustChangePassword: true },
  ])
    assert.throws(
      () => f.module.billing.save(u, f.v.id, f.input),
      (e) => e.status === 403,
    );
  f.db
    .prepare("UPDATE _service_work SET category='pm' WHERE job_id=?")
    .run(f.v.id);
  const pm = f.module.billing.detail(owner, f.v.id);
  assert.match(pm.blockers.join(" "), /agreement coverage/);
  assert.throws(
    () => f.module.billing.save(owner, f.v.id, f.input),
    /On-Demand/,
  );
  f.db
    .prepare("UPDATE _service_work SET category='on_demand' WHERE job_id=?")
    .run(f.v.id);
  f.db.exec(
    "CREATE TRIGGER fixture_billing_failure BEFORE INSERT ON _service_billing_audit BEGIN SELECT RAISE(ABORT,'billing audit failure'); END;",
  );
  assert.throws(
    () => f.module.billing.save(owner, f.v.id, f.input),
    /billing audit failure/,
  );
  assert.equal(f.module.billing.detail(owner, f.v.id).draft, null);
});
test("Billing calculation rounds tiny minute charges once per source and requires bounded integer rates", () => {
  const id = randomUUID(),
    source = {
      sourceToken: "a".repeat(64),
      technicianName: "Technician",
      labor: [
        {
          id,
          worked_minutes: 1,
          requested_billable_minutes: 1,
          work_type: "work",
        },
      ],
      materials: [],
    },
    input = {
      expectedVersion: 0,
      sourceToken: source.sourceToken,
      currency: "USD",
      labor: [{ sourceId: id, rateCents: 100, billableMinutes: 1, reason: "" }],
      materials: [],
      taxBasisPoints: 0,
      notes: "",
    };
  assert.equal(calculateBilling(source, input).totalCents, 2);
  assert.throws(() =>
    calculateBilling(source, {
      ...input,
      labor: [{ ...input.labor[0], rateCents: 1.5 }],
    }),
  );
});

test("Nonbillable work cannot become a customer charge through a billing override", () => {
  const id = randomUUID(),
    source = {
      sourceToken: "a".repeat(64),
      technicianName: "Tech",
      labor: [
        {
          id,
          worked_minutes: 20,
          requested_billable_minutes: 0,
          work_type: "nonbillable",
        },
      ],
      materials: [],
    };
  assert.throws(
    () =>
      calculateBilling(source, {
        expectedVersion: 0,
        sourceToken: source.sourceToken,
        currency: "USD",
        labor: [
          {
            sourceId: id,
            rateCents: 10000,
            billableMinutes: 10,
            reason: "Attempted explicit but invalid override",
          },
        ],
        materials: [],
        taxBasisPoints: 0,
        notes: "",
      }),
    /Nonbillable labor/,
  );
});
