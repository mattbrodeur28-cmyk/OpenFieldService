import { randomUUID, createHash } from "node:crypto";
import { migrate, transaction } from "../platform/sqlite.mjs";
import { inventorySchema, companyCostSchema } from "./schema.mjs";
import { companyStock, allocateCompanyValue } from "./costing.mjs";
import {
  admin,
  writer,
  fail,
  parse,
  schemas,
  proportional,
  legacyMilli,
} from "./domain.mjs";
export function createInventory({ storage, identity }) {
  const db = storage.database;
  migrate(db, "_inventory_migrations", [
    { version: 1, sql: inventorySchema },
    { version: 2, sql: companyCostSchema },
  ]);
  const requireAdmin = (user) => {
    if (!admin(user))
      fail("Owner or administrator inventory access required.", 403);
  };
  function requireWriter(user) {
    if (!writer(user))
      fail("Your account cannot access inventory operations.", 403);
  }
  const location = (id) => {
    const row = db
      .prepare("SELECT * FROM _inventory_locations WHERE id=?")
      .get(id);
    if (!row) fail("Stock location not found.", 404);
    return row;
  };
  function access(user, id, mode = "read") {
    requireWriter(user);
    const row = location(id);
    if (admin(user)) return row;
    const tech = identity.technician(user);
    if (
      !tech ||
      !row.active ||
      !(
        (row.kind === "warehouse" && mode !== "source") ||
        (row.kind === "truck" && row.technician_id === tech.technician_id)
      )
    )
      fail(
        "This stock location is not available to your technician account.",
        403,
      );
    return row;
  }
  function active(user, id, mode = "source") {
    const row = access(user, id, mode);
    if (!row.active) fail("Choose an active stock location.", 409);
    return row;
  }
  function item(id) {
    const row = db.prepare("SELECT * FROM materials WHERE id=?").get(id);
    if (!row) fail("Material not found.", 404);
    return row;
  }
  const balance = (loc, mat) =>
    db
      .prepare(
        "SELECT * FROM _inventory_balances WHERE location_id=? AND material_id=?",
      )
      .get(loc, mat) || {
      location_id: loc,
      material_id: mat,
      quantity_milli: 0,
      value_millicents: "0",
      reorder_milli: 0,
      version: 0,
    };
  const audit = (user, action, id, before, after, reason) =>
    db
      .prepare(
        "INSERT INTO _inventory_audit(actor_id,action,entity_id,before_json,after_json,reason) VALUES(?,?,?,?,?,?)",
      )
      .run(
        user.id,
        action,
        id,
        JSON.stringify(before),
        JSON.stringify(after),
        reason,
      );
  function options(user) {
    requireWriter(user);
    const tech = identity.technician(user),
      locations = db
        .prepare(
          "SELECT * FROM _inventory_locations ORDER BY kind,name,id LIMIT 501",
        )
        .all();
    if (locations.length > 500)
      fail("Narrow the company inventory scope before continuing.", 422);
    return {
      managedMaterialIds: db
        .prepare(
          "SELECT material_id FROM _inventory_materials ORDER BY material_id",
        )
        .all()
        .map((m) => m.material_id),
      canManage: admin(user),
      technicianId: tech?.technician_id || null,
      locations: admin(user)
        ? locations
        : locations.filter(
            (l) =>
              l.active &&
              tech &&
              (l.kind === "warehouse" ||
                l.technician_id === tech.technician_id),
          ),
    };
  }
  function detail(user, id, page = 1) {
    if (!Number.isInteger(page) || page < 1 || page > 100000)
      fail("Choose a valid inventory history page.");
    return transaction(db, () => {
      const place = access(user, id);
      const stock = db
        .prepare(
          "SELECT b.*,m.name,m.unit FROM _inventory_balances b JOIN materials m ON m.id=b.material_id WHERE b.location_id=? ORDER BY m.name,m.id LIMIT 1001",
        )
        .all(id);
      if (stock.length > 1000)
        fail(
          "This location needs a paginated inventory export before opening all items.",
          422,
        );
      const history = db
        .prepare(
          "SELECT m.id,m.kind,m.material_id,m.job_id,m.actor_id,m.reason,m.created_at,l.quantity_delta,l.value_delta,l.balance_version,(SELECT rev.id FROM _inventory_movements rev WHERE rev.reversal_of=m.id) AS reversed_by FROM _inventory_legs l JOIN _inventory_movements m ON m.id=l.movement_id WHERE l.location_id=? ORDER BY m.created_at DESC,m.rowid DESC LIMIT 101 OFFSET ?",
        )
        .all(id, (page - 1) * 100);
      return {
        location: place,
        canManage: admin(user),
        canIssue: admin(user) || place.kind === "truck",
        stock: stock.map((row) => {
          const pool = companyStock(db, row.material_id);
          return {
            ...row,
            company_unit_cost_cents: pool.quantity
              ? Number(proportional(pool.value, 1, pool.quantity))
              : null,
          };
        }),
        history: history.slice(0, 100),
        historyPage: page,
        hasMoreHistory: history.length > 100,
      };
    });
  }
  function saveLocationInTransaction(user, input) {
    requireAdmin(user);
    const data = parse(schemas.location, input);
    const before = data.id ? location(data.id) : null;
    if ((before?.version || 0) !== data.expectedVersion)
      fail("Location changed. Reload before saving.", 409);
    if (
      data.technicianId &&
      (data.kind !== "truck" ||
        !db
          .prepare("SELECT 1 FROM technicians WHERE id=? AND active=1")
          .get(data.technicianId))
    )
      fail("Choose an active technician for truck custody.");
    if (
      before &&
      (!data.active || data.kind !== before.kind) &&
      db
        .prepare(
          "SELECT 1 FROM _inventory_balances WHERE location_id=? AND quantity_milli>0",
        )
        .get(before.id)
    )
      fail(
        "Transfer all stock before deactivating a location or changing its type.",
        409,
      );
    if (
      db
        .prepare(
          "SELECT id FROM _inventory_locations WHERE code=? COLLATE NOCASE AND id<>?",
        )
        .get(data.code, data.id || "")
    )
      fail("That location code is already in use.", 409);
    const id = data.id || randomUUID();
    if (before)
      db.prepare(
        "UPDATE _inventory_locations SET name=?,code=?,kind=?,technician_id=?,active=?,version=version+1 WHERE id=?",
      ).run(
        data.name,
        data.code,
        data.kind,
        data.technicianId,
        Number(data.active),
        id,
      );
    else
      db.prepare(
        "INSERT INTO _inventory_locations(id,name,code,kind,technician_id,active) VALUES(?,?,?,?,?,?)",
      ).run(
        id,
        data.name,
        data.code,
        data.kind,
        data.technicianId,
        Number(data.active),
      );
    audit(user, "location_saved", id, before, location(id), data.reason);
    return location(id);
  }
  function saveLocation(user, input) {
    return transaction(db, () => saveLocationInTransaction(user, input));
  }
  function adopt(user, material, opening, qty) {
    if (
      db
        .prepare("SELECT 1 FROM _inventory_materials WHERE material_id=?")
        .get(material.id)
    ) {
      if (opening)
        fail(
          "Opening stock was already adopted. Use a receipt or an approved adjustment.",
          409,
        );
      return;
    }
    const old = legacyMilli(material.in_stock);
    if (old && !opening)
      fail(
        "Existing stock needs an explicit opening-balance review before receipts or transfers.",
        409,
      );
    if (opening && old !== qty)
      fail(
        "The opening quantity must match the existing catalog stock. Resolve differences before adoption.",
        409,
      );
    db.prepare(
      "INSERT INTO _inventory_materials(material_id,actor_id) VALUES(?,?)",
    ).run(material.id, user.id);
  }
  function jobActor(user, id, reason, returning = false) {
    const row = db
      .prepare(
        "SELECT j.*,e.stage,e.safety_id FROM jobs j LEFT JOIN _service_execution e ON e.job_id=j.id WHERE j.id=?",
      )
      .get(id);
    if (!row) fail("Job not found.", 404);
    if (
      db.prepare("SELECT 1 FROM invoices WHERE job_id=?").get(id) ||
      row.stage === "complete"
    )
      fail(
        "This job has billing records or finalized billing. A reviewed billing correction is required.",
        409,
      );
    if (returning && admin(user) && row.status === "completed") {
      if (reason.length < 10)
        fail(
          "A supervisor return for completed work requires a delegation reason.",
          403,
        );
      return { technicianId: row.technician_id, reason };
    }
    if (
      row.status !== "in_progress" ||
      row.stage !== "post_work" ||
      !row.safety_id
    )
      fail(
        "Submit PJSA and use the active post-work step before recording truck material usage or technician returns.",
        409,
      );
    return identity.executionActor(user, id, reason);
  }
  function post(user, kind, input) {
    requireWriter(user);
    if (
      !schemas[kind] ||
      ![
        "receipt",
        "transfer",
        "usage",
        "return",
        "adjustment",
        "reversal",
      ].includes(kind)
    )
      fail("Unknown stock operation.");
    const data = parse(schemas[kind], input);
    if (["receipt", "adjustment", "reversal"].includes(kind))
      requireAdmin(user);
    const hash = createHash("sha256")
      .update(JSON.stringify({ actor: user.id, kind, data }))
      .digest("hex");
    return transaction(db, () => {
      const prior = db
        .prepare("SELECT * FROM _inventory_movements WHERE request_key=?")
        .get(data.requestKey);
      if (prior) {
        if (prior.actor_id !== user.id)
          fail("That operation key belongs to another actor.", 403);
        if (prior.request_hash !== hash)
          fail(
            "This operation key was already used for different stock data.",
            409,
          );
        for (const leg of db
          .prepare(
            "SELECT location_id FROM _inventory_legs WHERE movement_id=?",
          )
          .all(prior.id))
          access(user, leg.location_id);
        return {
          movementId: prior.id,
          kind: prior.kind,
          materialId: prior.material_id,
          quantityMilli: prior.quantity_milli,
          jobMaterialId:
            db
              .prepare(
                "SELECT job_material_id FROM _inventory_job_usage WHERE movement_id=?",
              )
              .get(prior.id)?.job_material_id || null,
          replayed: true,
        };
      }
      let material,
        qty,
        value = 0n,
        jobId = null,
        technicianId = null,
        delegation = "",
        reversalOf = null,
        usage = null,
        legs = [],
        movementKind = kind;
      const leg = (loc, delta, cost, expected) => {
        active(user, loc, delta < 0 ? "source" : "destination");
        const before = balance(loc, material.id);
        if (before.version !== expected)
          fail(
            "Stock changed. Reload quantities and versions before posting.",
            409,
          );
        const nextQty = before.quantity_milli + delta,
          nextValue = BigInt(before.value_millicents) + cost;
        if (nextQty < 0 || nextQty > 1000000000000)
          fail(
            "Insufficient stock or invalid stock value. Review the source balance.",
            409,
          );
        const after = {
          ...before,
          quantity_milli: nextQty,
          value_millicents: nextValue.toString(),
          version: before.version + 1,
        };
        legs.push({ before, after, delta, value: cost.toString() });
      };
      if (kind === "receipt") {
        material = item(data.materialId);
        active(user, data.locationId, "destination");
        qty = data.quantityMilli;
        adopt(user, material, data.opening, qty);
        movementKind = data.opening ? "opening" : "receipt";
        value = BigInt(qty) * BigInt(data.unitCostCents);
        leg(data.locationId, qty, value, data.expectedVersion);
      }
      if (kind === "transfer") {
        if (data.fromLocationId === data.toLocationId)
          fail("Choose two different stock locations.");
        material = item(data.materialId);
        qty = data.quantityMilli;
        active(user, data.fromLocationId);
        const from = balance(data.fromLocationId, material.id);
        if (from.quantity_milli < qty)
          fail("Insufficient stock for this transfer.", 409);
        value = proportional(from.value_millicents, qty, from.quantity_milli);
        leg(data.fromLocationId, -qty, -value, data.expectedFromVersion);
        leg(data.toLocationId, qty, value, data.expectedToVersion);
      }
      if (kind === "usage") {
        material = item(data.materialId);
        qty = data.quantityMilli;
        const actor = jobActor(user, data.jobId, data.delegationReason);
        jobId = data.jobId;
        technicianId = actor.technicianId;
        delegation = actor.reason;
        const place = active(user, data.locationId);
        if (!admin(user) && place.kind !== "truck")
          fail("Technician usage must come from a truck in your custody.", 403);
        const from = balance(place.id, material.id);
        if (from.quantity_milli < qty)
          fail("Insufficient truck stock for this job usage.", 409);
        const pool = companyStock(db, material.id);
        value = proportional(pool.value, qty, pool.quantity);
        leg(place.id, -qty, -value, data.expectedVersion);
      }
      if (kind === "return") {
        usage = db
          .prepare(
            "SELECT u.*,m.material_id,m.job_id,m.value_millicents FROM _inventory_job_usage u JOIN _inventory_movements m ON m.id=u.movement_id WHERE u.job_material_id=?",
          )
          .get(data.jobMaterialId);
        if (!usage) fail("Tracked job usage not found.", 404);
        material = item(usage.material_id);
        qty = data.quantityMilli;
        if (usage.version !== data.expectedUsageVersion)
          fail(
            "The job return changed. Reload before returning more stock.",
            409,
          );
        if (qty > usage.quantity_milli - usage.returned_milli)
          fail(
            "Return quantity exceeds the remaining recorded job usage.",
            409,
          );
        const actor = jobActor(user, usage.job_id, data.delegationReason, true);
        jobId = usage.job_id;
        technicianId = actor.technicianId;
        delegation = actor.reason;
        value =
          proportional(
            usage.value_millicents,
            usage.returned_milli + qty,
            usage.quantity_milli,
          ) - BigInt(usage.returned_value_millicents);
        leg(data.toLocationId, qty, value, data.expectedToVersion);
      }
      if (kind === "adjustment") {
        material = item(data.materialId);
        if (
          !db
            .prepare("SELECT 1 FROM _inventory_materials WHERE material_id=?")
            .get(material.id)
        )
          fail(
            "Adopt opening stock or receive this material before adjusting counts.",
            409,
          );
        const before = balance(data.locationId, material.id),
          delta = data.countedMilli - before.quantity_milli;
        if (!delta)
          fail("This count has no stock variance. No adjustment was posted.");
        qty = Math.abs(delta);
        if (qty > 1000000000)
          fail(
            "This adjustment needs a reviewed bulk stock correction; a single movement cannot exceed one million units.",
            422,
          );
        value =
          delta < 0
            ? (() => {
                const pool = companyStock(db, material.id);
                return proportional(pool.value, qty, pool.quantity);
              })()
            : BigInt(qty) * BigInt(data.unitCostCents);
        leg(
          data.locationId,
          delta,
          delta < 0 ? -value : value,
          data.expectedVersion,
        );
      }
      if (kind === "reversal") {
        const original = db
          .prepare("SELECT * FROM _inventory_movements WHERE id=?")
          .get(data.movementId);
        if (!original) fail("Movement not found.", 404);
        if (
          !["receipt", "transfer", "adjustment", "opening"].includes(
            original.kind,
          )
        )
          fail(
            "Use the job-return workflow for usage. Reversals cannot reverse another reversal.",
          );
        if (
          db
            .prepare("SELECT 1 FROM _inventory_movements WHERE reversal_of=?")
            .get(original.id)
        )
          fail("This movement was already reversed.", 409);
        if (
          db
            .prepare(
              "SELECT id FROM _inventory_movements WHERE material_id=? ORDER BY rowid DESC LIMIT 1",
            )
            .get(original.material_id)?.id !== original.id
        )
          fail(
            "Later stock movements elsewhere in the company prevent direct reversal. Use a reviewed adjustment instead.",
            409,
          );
        material = item(original.material_id);
        qty = original.quantity_milli;
        value = BigInt(original.value_millicents);
        reversalOf = original.id;
        for (const originalLeg of db
          .prepare("SELECT * FROM _inventory_legs WHERE movement_id=?")
          .all(original.id)) {
          const current = balance(originalLeg.location_id, material.id);
          if (current.version !== originalLeg.balance_version)
            fail(
              "Later stock or policy changes prevent direct reversal. Use a reviewed adjustment instead.",
              409,
            );
          leg(
            originalLeg.location_id,
            -originalLeg.quantity_delta,
            -BigInt(originalLeg.value_delta),
            current.version,
          );
        }
      }
      const pool = companyStock(db, material.id);
      let quantityDelta = legs.reduce((sum, entry) => sum + entry.delta, 0);
      let valueDelta =
        kind === "transfer" ? 0n : quantityDelta < 0 ? -value : value;
      if (kind === "reversal") {
        const original = db
          .prepare("SELECT * FROM _inventory_movements WHERE id=?")
          .get(reversalOf);
        // Transfer values are internal and never add or remove company value.
        valueDelta =
          original.kind === "transfer"
            ? 0n
            : quantityDelta < 0
              ? -value
              : value;
      }
      const valuation = allocateCompanyValue(
        pool,
        legs,
        pool.value + valueDelta,
      );
      const id = randomUUID();
      db.prepare(
        "INSERT INTO _inventory_movements(id,request_key,request_hash,actor_id,kind,material_id,quantity_milli,value_millicents,job_id,technician_id,reason,delegation_reason,reversal_of,before_json,after_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ).run(
        id,
        data.requestKey,
        hash,
        user.id,
        movementKind,
        material.id,
        qty,
        value.toString(),
        jobId,
        technicianId,
        data.reason,
        delegation,
        reversalOf,
        JSON.stringify(legs.map((l) => l.before)),
        JSON.stringify(legs.map((l) => l.after)),
      );
      for (const l of legs) {
        const b = l.after;
        db.prepare(
          "INSERT INTO _inventory_balances(location_id,material_id,quantity_milli,value_millicents,reorder_milli,version) VALUES(?,?,?,?,?,?) ON CONFLICT(location_id,material_id) DO UPDATE SET quantity_milli=excluded.quantity_milli,value_millicents=excluded.value_millicents,version=excluded.version",
        ).run(
          b.location_id,
          b.material_id,
          b.quantity_milli,
          b.value_millicents,
          b.reorder_milli,
          b.version,
        );
        db.prepare(
          "INSERT INTO _inventory_legs(movement_id,location_id,quantity_delta,value_delta,balance_version) VALUES(?,?,?,?,?)",
        ).run(id, b.location_id, l.delta, l.value, b.version);
      }
      for (const row of valuation.extra)
        db.prepare(
          "UPDATE _inventory_balances SET value_millicents=?,version=? WHERE location_id=? AND material_id=?",
        ).run(row.value_millicents, row.version, row.location_id, material.id);
      db.prepare(
        "INSERT INTO _inventory_valuations(movement_id,method,before_json,after_json) VALUES(?,'company_weighted_average',?,?)",
      ).run(
        id,
        JSON.stringify(valuation.before),
        JSON.stringify(valuation.after),
      );
      let jobMaterialId = null;
      if (kind === "usage") {
        jobMaterialId = randomUUID();
        const unitCost = Number(proportional(value, 1, qty));
        db.prepare(
          "INSERT INTO _inventory_job_usage(job_material_id,movement_id,quantity_milli,cost_unit_cents) VALUES(?,?,?,?)",
        ).run(jobMaterialId, id, qty, unitCost);
        db.prepare(
          "INSERT INTO job_materials(id,job_id,material_id,quantity,unit_cost) VALUES(?,?,?,?,?)",
        ).run(jobMaterialId, jobId, material.id, qty / 1000, unitCost / 100);
      }
      if (kind === "return") {
        db.prepare(
          "UPDATE _inventory_job_usage SET returned_milli=returned_milli+?,returned_value_millicents=?,version=version+1 WHERE job_material_id=?",
        ).run(
          qty,
          (BigInt(usage.returned_value_millicents) + value).toString(),
          usage.job_material_id,
        );
        db.prepare("UPDATE job_materials SET quantity=? WHERE id=?").run(
          (usage.quantity_milli - usage.returned_milli - qty) / 1000,
          usage.job_material_id,
        );
      }
      return {
        movementId: id,
        kind: movementKind,
        materialId: material.id,
        quantityMilli: qty,
        jobMaterialId,
        replayed: false,
      };
    });
  }
  function policy(user, input) {
    requireAdmin(user);
    const data = parse(schemas.policy, input);
    return transaction(db, () => {
      active(user, data.locationId, "destination");
      item(data.materialId);
      if (
        !db
          .prepare("SELECT 1 FROM _inventory_materials WHERE material_id=?")
          .get(data.materialId)
      )
        fail(
          "Adopt this material into stock before configuring its reorder level.",
          409,
        );
      const before = balance(data.locationId, data.materialId);
      if (before.version !== data.expectedVersion)
        fail("Stock policy changed. Reload before saving.", 409);
      db.prepare(
        "INSERT INTO _inventory_balances(location_id,material_id,quantity_milli,value_millicents,reorder_milli,version) VALUES(?,?,0,'0',?,1) ON CONFLICT(location_id,material_id) DO UPDATE SET reorder_milli=excluded.reorder_milli,version=version+1",
      ).run(data.locationId, data.materialId, data.reorderMilli);
      const after = balance(data.locationId, data.materialId);
      audit(
        user,
        "reorder_policy",
        data.locationId,
        before,
        after,
        data.reason,
      );
      return after;
    });
  }
  function jobUsage(user, id) {
    const job = db.prepare("SELECT technician_id FROM jobs WHERE id=?").get(id);
    if (!job) fail("Job not found.", 404);
    requireWriter(user);
    if (
      !admin(user) &&
      identity.technician(user)?.technician_id !== job.technician_id
    )
      fail("Only the assigned technician can read this job stock usage.", 403);
    const rows = db
      .prepare(
        "SELECT u.*,m.material_id,m.quantity_milli AS original_quantity_milli,m.value_millicents,m.created_at,c.name,c.unit FROM _inventory_job_usage u JOIN _inventory_movements m ON m.id=u.movement_id JOIN materials c ON c.id=m.material_id WHERE m.job_id=? ORDER BY m.created_at,m.id LIMIT 201",
      )
      .all(id);
    if (rows.length > 200)
      fail("This job needs paginated stock usage before continuing.", 422);
    return { usage: rows };
  }
  return {
    options: (user) => transaction(db, () => options(user)),
    detail,
    saveLocation,
    // Internal synchronous composition only; the caller owns the service DB transaction.
    saveLocationInTransaction,
    post,
    policy,
    jobUsage: (user, id) => transaction(db, () => jobUsage(user, id)),
  };
}
