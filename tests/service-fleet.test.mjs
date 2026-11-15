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
import { createFleet } from "../src/server/fleet/service.mjs";
const reason = "Reviewed vehicle custody and maintenance record";
function setup(t) {
  const f = fixture(t),
    inv = f.module.inventory;
  const truck = inv.saveLocation(owner, {
    expectedVersion: 0,
    name: "Truck 01",
    code: "TRK01",
    kind: "truck",
    technicianId: f.tech,
    active: true,
    reason,
  });
  const fleet = createFleet({
    storage: f.storage,
    identity: f.module.service,
    inventory: inv,
    company: f.module.company,
    now: () => new Date("2026-11-15T04:30:00Z"),
  });
  const payload = {
    expectedVersion: 0,
    locationId: truck.id,
    expectedLocationVersion: truck.version,
    technicianId: f.tech,
    fleetNumber: "V01",
    vin: "",
    plate: "TEST-01",
    make: "Ford",
    model: "Transit",
    modelYear: 2020,
    status: "active",
    distanceUnit: "mi",
    odometerTenths: 100000,
    reason,
  };
  const vehicle = fleet.save(owner, payload);
  return { ...f, inv, fleet, truck, vehicle, payload };
}
const plan = (f, extras = {}) =>
  f.fleet.savePlan(owner, {
    id: randomUUID(),
    vehicleId: f.vehicle.id,
    expectedVersion: 0,
    title: "Oil and inspection",
    dueDate: "2026-11-14",
    dueOdometerTenths: 101000,
    intervalDays: 90,
    intervalDistanceTenths: 50000,
    warningDays: 7,
    warningDistanceTenths: 1000,
    active: true,
    reason,
    ...extras,
  });
test("Fleet uses native truck custody, scopes technician reads and rejects duplicate links and stale assignments", (t) => {
  const f = setup(t);
  assert.equal(f.fleet.list(member).vehicles[0].location_id, f.truck.id);
  assert.equal(f.fleet.list(other).vehicles.length, 0);
  assert.equal(f.fleet.list(hr).vehicles.length, 0);
  assert.throws(() => f.fleet.detail(other, f.vehicle.id), /not assigned/);
  assert.throws(() => f.fleet.save(hr, f.payload), /administrator/);
  assert.throws(
    () =>
      f.fleet.save(owner, {
        ...f.payload,
        expectedLocationVersion: f.vehicle.location_version,
        fleetNumber: "Other",
      }),
    /already assigned/,
  );
  assert.throws(
    () =>
      f.fleet.save(owner, {
        ...f.payload,
        id: f.vehicle.id,
        expectedVersion: 1,
        technicianId: null,
      }),
    /Location changed/,
  );
  const changed = f.fleet.save(owner, {
    ...f.payload,
    id: f.vehicle.id,
    expectedVersion: 1,
    expectedLocationVersion: f.vehicle.location_version,
    technicianId: null,
  });
  assert.equal(changed.technician_id, null);
  assert.equal(f.inv.detail(owner, f.truck.id).location.technician_id, null);
  assert.equal(f.fleet.list(member).vehicles.length, 0);
  assert.throws(
    () =>
      f.inv.saveLocation(owner, {
        id: f.truck.id,
        expectedVersion: changed.location_version,
        name: "No truck",
        code: "TRK01",
        kind: "warehouse",
        technicianId: null,
        active: true,
        reason,
      }),
    /FLEET_REQUIRES_TRUCK/,
  );
  assert.equal(f.inv.detail(owner, f.truck.id).location.kind, "truck");
});
test("Fleet reminders use company date and mileage; completion advances recurrence once with original audit and cost", (t) => {
  const f = setup(t),
    p = plan(f);
  assert.equal(f.fleet.list(owner).today, "2026-11-14");
  assert.equal(
    f.fleet.detail(member, f.vehicle.id).maintenance[0].reminder_status,
    "due",
  );
  const input = {
    requestKey: randomUUID(),
    vehicleId: f.vehicle.id,
    planId: p.id,
    expectedVehicleVersion: 1,
    expectedPlanVersion: 1,
    serviceDate: "2026-11-14",
    odometerTenths: 101000,
    costCents: 12999,
    notes: reason,
  };
  const done = f.fleet.complete(owner, input);
  assert.equal(f.fleet.complete(owner, input).replayed, true);
  const details = f.fleet.detail(owner, f.vehicle.id);
  assert.equal(details.history.length, 1);
  assert.equal(details.history[0].cost_cents, 12999);
  assert.equal(details.maintenance[0].due_date, "2027-02-12");
  assert.equal(details.maintenance[0].due_odometer_tenths, 151000);
  assert.equal(details.maintenance[0].reminder_status, "upcoming");
  assert.throws(
    () => f.fleet.complete(owner, { ...input, costCents: 1 }),
    /different service data/,
  );
  assert.throws(() => f.fleet.complete(member, input), /administrator/);
  assert.throws(
    () =>
      f.db
        .prepare("UPDATE _fleet_services SET notes=? WHERE id=?")
        .run("erase", done.serviceId),
    /IMMUTABLE/,
  );
  assert.throws(
    () => f.fleet.complete(owner, { ...input, requestKey: randomUUID() }),
    /changed/,
  );
});
test("Fleet rejects future/decreasing readings, rolls custody and completion back on evidence failure, and blocks retirement with stock", (t) => {
  const f = setup(t),
    p = plan(f);
  assert.throws(
    () =>
      f.fleet.save(owner, {
        ...f.payload,
        id: f.vehicle.id,
        expectedVersion: 1,
        expectedLocationVersion: f.vehicle.location_version,
        odometerTenths: 1,
      }),
    /cannot decrease/,
  );
  const input = {
    requestKey: randomUUID(),
    vehicleId: f.vehicle.id,
    planId: p.id,
    expectedVehicleVersion: 1,
    expectedPlanVersion: 1,
    serviceDate: "2026-11-15",
    odometerTenths: 101000,
    costCents: 0,
    notes: reason,
  };
  assert.throws(() => f.fleet.complete(owner, input), /future service/);
  f.db.exec(
    "CREATE TRIGGER fixture_fleet_service_fail BEFORE INSERT ON _fleet_services BEGIN SELECT RAISE(ABORT,'fixture fleet failure'); END;",
  );
  assert.throws(
    () => f.fleet.complete(owner, { ...input, serviceDate: "2026-11-14" }),
    /fixture fleet failure/,
  );
  assert.equal(
    f.fleet.detail(owner, f.vehicle.id).vehicle.odometer_tenths,
    100000,
  );
  assert.equal(f.fleet.detail(owner, f.vehicle.id).maintenance[0].version, 1);
  f.db.exec(
    "CREATE TRIGGER fixture_fleet_audit_fail BEFORE INSERT ON _fleet_audit BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END;",
  );
  assert.throws(
    () =>
      f.fleet.save(owner, {
        ...f.payload,
        id: f.vehicle.id,
        expectedVersion: 1,
        expectedLocationVersion: f.vehicle.location_version,
        technicianId: null,
      }),
    /fixture audit failure/,
  );
  assert.equal(f.inv.detail(owner, f.truck.id).location.technician_id, f.tech);
  const material = randomUUID();
  f.db
    .prepare(
      "INSERT INTO materials(id,name,unit,in_stock) VALUES(?,'part','ea',0)",
    )
    .run(material);
  f.inv.post(owner, "receipt", {
    requestKey: randomUUID(),
    materialId: material,
    locationId: f.truck.id,
    quantityMilli: 1000,
    unitCostCents: 100,
    expectedVersion: 0,
    reason,
  });
  assert.throws(
    () =>
      f.fleet.save(owner, {
        ...f.payload,
        id: f.vehicle.id,
        expectedVersion: 1,
        expectedLocationVersion: f.vehicle.location_version,
        status: "retired",
      }),
    /Transfer all stock/,
  );
});

test("Maintenance plan creation cannot duplicate on retry, and one-time thresholds do not survive as stale recurring triggers", (t) => {
  const f = setup(t);
  const p = plan(f, { intervalDistanceTenths: null });
  assert.throws(
    () =>
      f.fleet.savePlan(owner, {
        id: p.id,
        vehicleId: f.vehicle.id,
        expectedVersion: 0,
        title: p.title,
        dueDate: p.due_date,
        dueOdometerTenths: p.due_odometer_tenths,
        intervalDays: p.interval_days,
        intervalDistanceTenths: null,
        warningDays: 7,
        warningDistanceTenths: 1000,
        active: true,
        reason,
      }),
    /changed/,
  );
  assert.equal(f.fleet.detail(owner, f.vehicle.id).maintenance.length, 1);
  f.fleet.complete(owner, {
    requestKey: randomUUID(),
    vehicleId: f.vehicle.id,
    planId: p.id,
    expectedVehicleVersion: 1,
    expectedPlanVersion: 1,
    serviceDate: "2026-11-14",
    odometerTenths: 101000,
    costCents: 0,
    notes: reason,
  });
  assert.equal(
    f.fleet.detail(owner, f.vehicle.id).maintenance[0].due_odometer_tenths,
    null,
  );
  const once = plan(f, {
    title: "One-time inspection",
    intervalDays: null,
    intervalDistanceTenths: null,
  });
  f.fleet.complete(owner, {
    requestKey: randomUUID(),
    vehicleId: f.vehicle.id,
    planId: once.id,
    expectedVehicleVersion: 2,
    expectedPlanVersion: 1,
    serviceDate: "2026-11-14",
    odometerTenths: 101000,
    costCents: 0,
    notes: reason,
  });
  assert.equal(
    f.fleet
      .detail(owner, f.vehicle.id)
      .maintenance.find((p) => p.id === once.id).active,
    0,
  );
  assert.throws(() => plan(f, { dueDate: "2026-02-30" }), /real date/);
});
