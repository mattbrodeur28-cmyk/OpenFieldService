import { z } from "zod";
import { setWorkCategory } from "./work.mjs";

// Service owns native Job numbering and PM classification. Maintenance work
// generation calls this inside the Agreements module's caller-owned transaction;
// the shared job_counter keeps one numbering namespace across Sales and Agreements.
const input = z.object({
    id: z.string().uuid(),
    customerId: z.string().uuid(),
    siteId: z.string().uuid(),
    assetId: z.string().uuid().nullable(),
    serviceTypeId: z.string().uuid().nullable(),
    planningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v),
    durationMinutes: z.number().int().min(15).max(1440),
    title: z.string().min(1).max(200),
    notes: z.string().max(12000),
}).strict();

export function createMaintenanceJobs({ storage }) {
    const db = storage.database;
    function createInTransaction(user, raw) {
        if (!user?.active || user.mustChangePassword || !["owner", "admin"].includes(user.role))
            throw new Error("MAINTENANCE_JOB_FORBIDDEN");
        if (!db.isTransaction)
            throw new Error("Maintenance job generation requires a caller-owned transaction.");
        const parsed = input.safeParse(raw);
        if (!parsed.success)
            throw new Error("MAINTENANCE_JOB_INVALID");
        const d = parsed.data;
        if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_dispatch_job_state'").get())
            throw new Error("MAINTENANCE_DISPATCH_MISSING");
        if (db.prepare("SELECT 1 FROM jobs WHERE id=?").get(d.id))
            throw new Error("MAINTENANCE_JOB_DUPLICATE");
        const site = db.prepare("SELECT name,address FROM sites WHERE id=? AND customer_id=?").get(d.siteId, d.customerId);
        if (!site)
            throw new Error("MAINTENANCE_SITE_INVALID");
        if (d.assetId && !db.prepare("SELECT 1 FROM assets WHERE id=? AND customer_id=? AND site_id=?").get(d.assetId, d.customerId, d.siteId))
            throw new Error("MAINTENANCE_ASSET_INVALID");
        if (d.serviceTypeId && !db.prepare("SELECT 1 FROM service_types WHERE id=?").get(d.serviceTypeId))
            throw new Error("MAINTENANCE_SERVICE_TYPE_INVALID");
        const prefix = db.prepare("SELECT value FROM _meta WHERE key='identifier_prefix'").get()?.value || "JOB";
        let identifier;
        do {
            const counter = db.prepare("INSERT INTO _meta(key,value) VALUES('job_counter','1') ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1 RETURNING value").get();
            const number = Number(counter.value);
            if (!Number.isSafeInteger(number) || number < 1)
                throw new Error("MAINTENANCE_JOB_COUNTER");
            identifier = `${prefix}-${number}`;
        } while (db.prepare("SELECT 1 FROM jobs WHERE identifier=?").get(identifier));
        db.prepare("INSERT INTO jobs(id,identifier,customer_id,asset_id,service_type_id,technician_id,status,priority,scheduled_date,scheduled_time,duration,price,address,notes) VALUES(?,?,?,?,?,NULL,'scheduled','normal',?,'09:00',?,0,?,?)")
            .run(d.id, identifier, d.customerId, d.assetId, d.serviceTypeId, d.planningDate, d.durationMinutes, site.address || "", d.notes);
        setWorkCategory(db, user, d.id, "pm");
        return { id: d.id, identifier, customerId: d.customerId, siteId: d.siteId, assetId: d.assetId, planningDate: d.planningDate, durationMinutes: d.durationMinutes, status: "scheduled", assigned: false, workCategory: "pm" };
    }
    return { createInTransaction };
}
