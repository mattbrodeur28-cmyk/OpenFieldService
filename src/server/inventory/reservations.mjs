import { randomUUID } from "node:crypto";
import { z } from "zod";
import { migrate, transaction } from "../platform/sqlite.mjs";
import { admin, fail, parse } from "./domain.mjs";

const reservationSchema = `
CREATE TABLE _inventory_reservations(
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES _inventory_locations(id) ON DELETE RESTRICT,
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  quantity_milli INTEGER NOT NULL CHECK(quantity_milli BETWEEN 1 AND 1000000000),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','consumed','released')),
  actor_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _inventory_reservations_loc ON _inventory_reservations(location_id,material_id,status);
CREATE TABLE _inventory_stocktakes(
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES _inventory_locations(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','approved','cancelled')),
  counts_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

const uuid = z.string().uuid();
const reserveInput = z.object({
    locationId: uuid,
    materialId: uuid,
    jobId: uuid,
    quantityMilli: z.number().int().min(1).max(1000000000),
    reason: z.string().trim().min(5).max(1000),
}).strict();

const stocktakeInput = z.object({
    locationId: uuid,
    notes: z.string().trim().max(2000).default(""),
    counts: z.array(z.object({
        materialId: uuid,
        countedMilli: z.number().int().nonnegative().max(1000000000),
    }).strict()).min(1).max(500),
}).strict();

export function createInventoryExtensions({ storage }) {
    const db = storage.database;
    migrate(db, "_inventory_ext_migrations", [{ version: 1, sql: reservationSchema }]);

    const requireWriter = (user) => {
        if (!user?.active || user.mustChangePassword) fail("Sign in to continue.", 401);
        if (!["owner", "admin", "member", "technician"].includes(user.role)) fail("Inventory write access required.", 403);
    };
    const requireAdmin = (user) => {
        if (!admin(user)) fail("Owner or administrator Inventory access required.", 403);
    };

    const listReservations = (user, query = {}) => {
        if (!user?.active) fail("Sign in to continue.", 401);
        const where = ["1=1"], params = [];
        if (query.jobId) { where.push("r.job_id=?"); params.push(query.jobId); }
        if (query.locationId) { where.push("r.location_id=?"); params.push(query.locationId); }
        return db.prepare(
            `SELECT r.id,r.location_id AS locationId,l.name AS locationName,r.material_id AS materialId,
                    m.name AS materialName,r.job_id AS jobId,j.identifier AS jobIdentifier,
                    r.quantity_milli AS quantityMilli,r.status,r.actor_id AS actorId,r.reason,r.created_at AS createdAt
             FROM _inventory_reservations r
             JOIN _inventory_locations l ON l.id=r.location_id
             JOIN materials m ON m.id=r.material_id
             JOIN jobs j ON j.id=r.job_id
             WHERE ${where.join(" AND ")} ORDER BY r.created_at DESC LIMIT 200`
        ).all(...params).map((r) => ({ ...r }));
    };

    function reserve(user, raw) {
        requireWriter(user);
        const d = parse(reserveInput, raw);
        return transaction(db, () => {
            const bal = db.prepare("SELECT quantity_milli FROM _inventory_balances WHERE location_id=? AND material_id=?").get(d.locationId, d.materialId);
            const onHand = bal?.quantity_milli || 0;
            const alreadyReserved = db.prepare(
                "SELECT COALESCE(SUM(quantity_milli),0) AS q FROM _inventory_reservations WHERE location_id=? AND material_id=? AND status='active'"
            ).get(d.locationId, d.materialId).q || 0;
            if (onHand - alreadyReserved < d.quantityMilli) {
                fail(`Insufficient unreserved stock (${(onHand - alreadyReserved) / 1000} available after active reservations).`, 409);
            }
            const id = randomUUID();
            db.prepare(
                "INSERT INTO _inventory_reservations(id,location_id,material_id,job_id,quantity_milli,status,actor_id,reason) VALUES(?,?,?,?,?,'active',?,?)"
            ).run(id, d.locationId, d.materialId, d.jobId, d.quantityMilli, user.id, d.reason);
            return { reservation: listReservations(user, { jobId: d.jobId }).find((r) => r.id === id) };
        });
    }

    function releaseReservation(user, id, nextStatus = "released") {
        requireWriter(user);
        parse(uuid, id);
        if (!["released", "consumed"].includes(nextStatus)) fail("Choose released or consumed.");
        const row = db.prepare("SELECT * FROM _inventory_reservations WHERE id=?").get(id);
        if (!row) fail("Reservation not found.", 404);
        if (row.status !== "active") fail("Only active reservations can be updated.", 409);
        db.prepare("UPDATE _inventory_reservations SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(nextStatus, id);
        return { id, status: nextStatus };
    }

    const listStocktakes = (user) => {
        requireAdmin(user);
        return db.prepare(
            `SELECT s.id,s.location_id AS locationId,l.name AS locationName,s.status,s.counts_json AS countsJson,
                    s.notes,s.created_by AS createdBy,s.approved_by AS approvedBy,s.approved_at AS approvedAt,s.created_at AS createdAt
             FROM _inventory_stocktakes s JOIN _inventory_locations l ON l.id=s.location_id ORDER BY s.created_at DESC LIMIT 100`
        ).all().map((r) => ({ ...r, counts: JSON.parse(r.countsJson || "[]") }));
    };

    function createStocktake(user, raw) {
        requireWriter(user);
        const d = parse(stocktakeInput, raw);
        return transaction(db, () => {
            if (!db.prepare("SELECT 1 FROM _inventory_locations WHERE id=?").get(d.locationId)) fail("Location not found.", 404);
            const enriched = d.counts.map((c) => {
                const bal = db.prepare("SELECT quantity_milli FROM _inventory_balances WHERE location_id=? AND material_id=?").get(d.locationId, c.materialId);
                const expectedMilli = bal?.quantity_milli || 0;
                return { materialId: c.materialId, expectedMilli, countedMilli: c.countedMilli, varianceMilli: c.countedMilli - expectedMilli };
            });
            const id = randomUUID();
            db.prepare("INSERT INTO _inventory_stocktakes(id,location_id,status,counts_json,notes,created_by) VALUES(?,?,'open',?,?,?)")
                .run(id, d.locationId, JSON.stringify(enriched), d.notes, user.id);
            return { stocktake: { id, locationId: d.locationId, status: "open", counts: enriched, notes: d.notes } };
        });
    }

    function approveStocktake(user, id) {
        requireAdmin(user);
        parse(uuid, id);
        return transaction(db, () => {
            const st = db.prepare("SELECT * FROM _inventory_stocktakes WHERE id=?").get(id);
            if (!st) fail("Stocktake not found.", 404);
            if (st.status !== "open") fail("Only open stocktakes can be approved.", 409);
            db.prepare("UPDATE _inventory_stocktakes SET status='approved',approved_by=?,approved_at=CURRENT_TIMESTAMP WHERE id=?").run(user.id, id);
            return { id, status: "approved", approvedBy: user.id };
        });
    }

    return { listReservations, reserve, releaseReservation, listStocktakes, createStocktake, approveStocktake };
}
