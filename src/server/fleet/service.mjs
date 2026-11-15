import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { migrate, transaction } from "../platform/sqlite.mjs";
import {
  admin,
  writer,
  fail,
  parse,
  reason,
  version,
} from "../inventory/domain.mjs";
import { fleetSchema } from "./schema.mjs";
const uuid = z.string().uuid();
const distance = z.number().int().min(0).max(100000000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return (
      Number.isFinite(d.valueOf()) &&
      d.toISOString().slice(0, 10) === v &&
      v >= "2000-01-01" &&
      v <= "2100-12-31"
    );
  }, "Choose a real date between 2000 and 2100.");
const vehicleInput = z
  .object({
    id: uuid.optional(),
    expectedVersion: version,
    locationId: uuid,
    expectedLocationVersion: version,
    technicianId: uuid.nullable(),
    fleetNumber: z.string().trim().min(1).max(32),
    vin: z
      .string()
      .trim()
      .toUpperCase()
      .max(17)
      .refine(
        (v) => !v || /^[A-HJ-NPR-Z0-9]{17}$/.test(v),
        "VIN must be 17 valid characters or blank.",
      ),
    plate: z.string().trim().max(32),
    make: z.string().trim().max(60),
    model: z.string().trim().max(80),
    modelYear: z.number().int().min(1900).max(2100).nullable(),
    status: z.enum(["active", "out_of_service", "retired"]),
    distanceUnit: z.enum(["mi", "km"]),
    odometerTenths: distance,
    reason,
  })
  .strict();
const planInput = z
  .object({
    id: uuid,
    vehicleId: uuid,
    expectedVersion: version,
    title: z.string().trim().min(1).max(120),
    dueDate: date.nullable(),
    dueOdometerTenths: distance.nullable(),
    intervalDays: z.number().int().min(1).max(3650).nullable(),
    intervalDistanceTenths: z.number().int().min(1).max(10000000).nullable(),
    warningDays: z.number().int().min(0).max(365),
    warningDistanceTenths: distance,
    active: z.boolean(),
    reason,
  })
  .strict()
  .refine(
    (v) => v.dueDate !== null || v.dueOdometerTenths !== null,
    "Choose a due date or odometer reading.",
  )
  .refine(
    (v) =>
      (!v.intervalDays || v.dueDate) &&
      (!v.intervalDistanceTenths || v.dueOdometerTenths !== null),
    "Recurring intervals require a matching due date or odometer.",
  );
const serviceInput = z
  .object({
    requestKey: uuid,
    vehicleId: uuid,
    planId: uuid,
    expectedVehicleVersion: version,
    expectedPlanVersion: version,
    serviceDate: date,
    odometerTenths: distance,
    costCents: z.number().int().min(0).max(100000000),
    notes: reason,
  })
  .strict();
const addDays = (day, days) => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  const next = d.toISOString().slice(0, 10);
  if (next > "2100-12-31")
    fail("The next maintenance date exceeds the supported range.");
  return next;
};
export function createFleet({
  storage,
  identity,
  inventory,
  company,
  now = () => new Date(),
}) {
  const db = storage.database;
  migrate(db, "_fleet_migrations", [{ version: 1, sql: fleetSchema }]);
  const today = () => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: company.timeZone(),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now());
    const get = (type) => parts.find((part) => part.type === type).value;
    return get("year") + "-" + get("month") + "-" + get("day");
  };
  const requireAdmin = (user) => {
    if (!admin(user))
      fail("Owner or administrator Fleet access required.", 403);
  };
  const vehicle = (id) => {
    const row = db
      .prepare(
        "SELECT v.*,l.name AS location_name,l.code AS location_code,l.technician_id,l.active AS location_active,l.version AS location_version,t.name AS technician_name FROM _fleet_vehicles v JOIN _inventory_locations l ON l.id=v.location_id LEFT JOIN technicians t ON t.id=l.technician_id WHERE v.id=?",
      )
      .get(id);
    if (!row) fail("Vehicle not found.", 404);
    return row;
  };
  const access = (user, id) => {
    if (!writer(user)) fail("Your account cannot access Fleet.", 403);
    const row = vehicle(id);
    if (
      !admin(user) &&
      (!row.location_active ||
        row.technician_id !== identity.technician(user)?.technician_id)
    )
      fail("This vehicle is not assigned to your technician account.", 403);
    return row;
  };
  const audit = (user, action, id, before, after, notes) =>
    db
      .prepare(
        "INSERT INTO _fleet_audit(actor_id,action,entity_id,before_json,after_json,reason) VALUES(?,?,?,?,?,?)",
      )
      .run(
        user.id,
        action,
        id,
        JSON.stringify(before),
        JSON.stringify(after),
        notes,
      );
  function plans(id, v) {
    const day = today();
    return db
      .prepare(
        "SELECT * FROM _fleet_plans WHERE vehicle_id=? ORDER BY active DESC,title,id LIMIT 201",
      )
      .all(id)
      .map((p) => {
        const late =
          (p.due_date && p.due_date < day) ||
          (p.due_odometer_tenths !== null &&
            p.due_odometer_tenths < v.odometer_tenths);
        const soon =
          (p.due_date && p.due_date <= addDays(day, p.warning_days)) ||
          (p.due_odometer_tenths !== null &&
            p.due_odometer_tenths <=
              v.odometer_tenths + p.warning_distance_tenths);
        return {
          ...p,
          reminder_status: !p.active
            ? "inactive"
            : late
              ? "overdue"
              : soon
                ? "due"
                : "upcoming",
        };
      });
  }
  function list(user) {
    if (!writer(user)) fail("Your account cannot access Fleet.", 403);
    const ids = db
      .prepare(
        "SELECT id FROM _fleet_vehicles ORDER BY fleet_number,id LIMIT 501",
      )
      .all();
    if (ids.length > 500)
      fail("Fleet scope exceeds 500 vehicles; pagination is required.", 422);
    const tech = identity.technician(user)?.technician_id;
    const vehicles = ids
      .map((row) => vehicle(row.id))
      .filter(
        (v) =>
          admin(user) ||
          (v.location_active && tech && v.technician_id === tech),
      );
    return {
      canManage: admin(user),
      today: today(),
      vehicles: vehicles.map((v) => ({ ...v, maintenance: plans(v.id, v) })),
    };
  }
  function detail(user, id, page = 1) {
    const v = access(user, id);
    if (!Number.isInteger(page) || page < 1 || page > 100000)
      fail("Choose a valid service history page.");
    const history = db
      .prepare(
        "SELECT id,actor_id,plan_id,service_date,odometer_tenths,cost_cents,notes,created_at FROM _fleet_services WHERE vehicle_id=? ORDER BY service_date DESC,rowid DESC LIMIT 101 OFFSET ?",
      )
      .all(id, (page - 1) * 100);
    const maintenance = plans(id, v);
    if (maintenance.length > 200)
      fail("This vehicle requires paginated maintenance plans.", 422);
    return {
      vehicle: v,
      maintenance,
      history: history.slice(0, 100),
      hasMoreHistory: history.length > 100,
      page,
      canManage: admin(user),
    };
  }
  function save(user, raw) {
    requireAdmin(user);
    const d = parse(vehicleInput, raw);
    return transaction(db, () => {
      const before = d.id ? vehicle(d.id) : null;
      if ((before?.version || 0) !== d.expectedVersion)
        fail("Vehicle changed. Reload before saving.", 409);
      if (
        before &&
        (before.location_id !== d.locationId ||
          before.distance_unit !== d.distanceUnit)
      )
        fail(
          "Vehicle stock link and distance unit cannot change. Create a reviewed migration instead.",
          409,
        );
      if (before && d.odometerTenths < before.odometer_tenths)
        fail(
          "Odometer cannot decrease; a reviewed correction is required.",
          409,
        );
      const loc = db
        .prepare("SELECT * FROM _inventory_locations WHERE id=?")
        .get(d.locationId);
      if (!loc || loc.kind !== "truck")
        fail("Choose an existing truck stock location.");
      if (
        db
          .prepare(
            "SELECT id FROM _fleet_vehicles WHERE id<>? AND (location_id=? OR fleet_number=? COLLATE NOCASE OR (vin<>'' AND vin=?))",
          )
          .get(d.id || "", d.locationId, d.fleetNumber, d.vin)
      )
        fail("Truck location, fleet number or VIN is already assigned.", 409);
      if (
        !before &&
        db.prepare("SELECT COUNT(*) AS n FROM _fleet_vehicles").get().n >= 500
      )
        fail("Fleet scope exceeds the pilot limit.", 422);
      inventory.saveLocationInTransaction(user, {
        id: loc.id,
        expectedVersion: d.expectedLocationVersion,
        name: loc.name,
        code: loc.code,
        kind: "truck",
        technicianId: d.technicianId,
        active: d.status !== "retired",
        reason: d.reason,
      });
      const id = d.id || randomUUID();
      if (before)
        db.prepare(
          "UPDATE _fleet_vehicles SET fleet_number=?,vin=?,plate=?,make=?,model=?,model_year=?,status=?,odometer_tenths=?,version=version+1 WHERE id=?",
        ).run(
          d.fleetNumber,
          d.vin,
          d.plate,
          d.make,
          d.model,
          d.modelYear,
          d.status,
          d.odometerTenths,
          id,
        );
      else
        db.prepare(
          "INSERT INTO _fleet_vehicles(id,location_id,fleet_number,vin,plate,make,model,model_year,status,distance_unit,odometer_tenths) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        ).run(
          id,
          d.locationId,
          d.fleetNumber,
          d.vin,
          d.plate,
          d.make,
          d.model,
          d.modelYear,
          d.status,
          d.distanceUnit,
          d.odometerTenths,
        );
      audit(user, "vehicle_saved", id, before, vehicle(id), d.reason);
      return vehicle(id);
    });
  }
  function savePlan(user, raw) {
    requireAdmin(user);
    const d = parse(planInput, raw);
    return transaction(db, () => {
      const v = vehicle(d.vehicleId);
      if (v.status === "retired")
        fail("Restore the vehicle before changing maintenance.", 409);
      const before = db
        .prepare("SELECT * FROM _fleet_plans WHERE id=?")
        .get(d.id) || null;
      if (
        (before && before.vehicle_id !== d.vehicleId) ||
        (!before && d.expectedVersion > 0)
      )
        fail("Maintenance plan not found.", 404);
      if ((before?.version || 0) !== d.expectedVersion)
        fail("Maintenance plan changed. Reload before saving.", 409);
      if (
        !before &&
        db
          .prepare("SELECT COUNT(*) AS n FROM _fleet_plans WHERE vehicle_id=?")
          .get(v.id).n >= 200
      )
        fail("Maintenance plans exceed the pilot limit.", 422);
      const id = d.id || randomUUID();
      if (before)
        db.prepare(
          "UPDATE _fleet_plans SET title=?,due_date=?,due_odometer_tenths=?,interval_days=?,interval_distance_tenths=?,warning_days=?,warning_distance_tenths=?,active=?,version=version+1 WHERE id=?",
        ).run(
          d.title,
          d.dueDate,
          d.dueOdometerTenths,
          d.intervalDays,
          d.intervalDistanceTenths,
          d.warningDays,
          d.warningDistanceTenths,
          Number(d.active),
          id,
        );
      else
        db.prepare(
          "INSERT INTO _fleet_plans(id,vehicle_id,title,due_date,due_odometer_tenths,interval_days,interval_distance_tenths,warning_days,warning_distance_tenths,active) VALUES(?,?,?,?,?,?,?,?,?,?)",
        ).run(
          id,
          v.id,
          d.title,
          d.dueDate,
          d.dueOdometerTenths,
          d.intervalDays,
          d.intervalDistanceTenths,
          d.warningDays,
          d.warningDistanceTenths,
          Number(d.active),
        );
      const after = db.prepare("SELECT * FROM _fleet_plans WHERE id=?").get(id);
      audit(user, "plan_saved", id, before, after, d.reason);
      return after;
    });
  }
  function complete(user, raw) {
    requireAdmin(user);
    const d = parse(serviceInput, raw);
    const hash = createHash("sha256")
      .update(JSON.stringify({ actor: user.id, data: d }))
      .digest("hex");
    return transaction(db, () => {
      const prior = db
        .prepare("SELECT * FROM _fleet_services WHERE request_key=?")
        .get(d.requestKey);
      if (prior) {
        if (prior.actor_id !== user.id || prior.request_hash !== hash)
          fail("This request key was used for different service data.", 409);
        return { serviceId: prior.id, replayed: true };
      }
      const v = vehicle(d.vehicleId),
        p = db
          .prepare("SELECT * FROM _fleet_plans WHERE id=? AND vehicle_id=?")
          .get(d.planId, d.vehicleId);
      if (!p) fail("Maintenance plan not found.", 404);
      if (
        v.version !== d.expectedVehicleVersion ||
        p.version !== d.expectedPlanVersion
      )
        fail(
          "Vehicle or maintenance changed. Reload before completing service.",
          409,
        );
      if (v.status === "retired" || !p.active)
        fail("Choose active maintenance on a current vehicle.", 409);
      if (
        d.odometerTenths < v.odometer_tenths ||
        d.serviceDate > today() ||
        (p.last_service_date && d.serviceDate < p.last_service_date)
      )
        fail(
          "Review service date and odometer; future service, decreasing mileage or older completion is not allowed.",
          409,
        );
      const dueDate = p.interval_days
        ? addDays(d.serviceDate, p.interval_days)
        : null;
      const dueDistance = p.interval_distance_tenths
        ? d.odometerTenths + p.interval_distance_tenths
        : null;
      if (dueDistance > 100000000)
        fail("Next service mileage exceeds supported range.");
      const recurring = dueDate !== null || dueDistance !== null;
      db.prepare(
        "UPDATE _fleet_vehicles SET odometer_tenths=?,version=version+1 WHERE id=?",
      ).run(d.odometerTenths, v.id);
      db.prepare(
        "UPDATE _fleet_plans SET due_date=?,due_odometer_tenths=?,active=?,last_service_date=?,version=version+1 WHERE id=?",
      ).run(
        recurring ? dueDate : p.due_date,
        recurring ? dueDistance : p.due_odometer_tenths,
        Number(recurring),
        d.serviceDate,
        p.id,
      );
      const id = randomUUID(),
        after = {
          vehicle: vehicle(v.id),
          plan: db.prepare("SELECT * FROM _fleet_plans WHERE id=?").get(p.id),
        };
      db.prepare(
        "INSERT INTO _fleet_services(id,request_key,request_hash,actor_id,vehicle_id,plan_id,service_date,odometer_tenths,cost_cents,notes,before_json,after_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      ).run(
        id,
        d.requestKey,
        hash,
        user.id,
        v.id,
        p.id,
        d.serviceDate,
        d.odometerTenths,
        d.costCents,
        d.notes,
        JSON.stringify({ vehicle: v, plan: p }),
        JSON.stringify(after),
      );
      return { serviceId: id, replayed: false };
    });
  }
  return {
    list: (user) => transaction(db, () => list(user)),
    detail: (user, id, page) => transaction(db, () => detail(user, id, page)),
    save,
    savePlan,
    complete,
  };
}
