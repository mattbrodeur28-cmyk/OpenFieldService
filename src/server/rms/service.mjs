import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { migrate, transaction } from "../platform/sqlite.mjs";
import { rmsSchema } from "./schema.mjs";

export class RmsError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = (msg, status = 400) => { throw new RmsError(msg, status); };
const parse = (schema, raw) => {
    const r = schema.safeParse(raw);
    if (!r.success) fail(r.error.issues.map((i) => i.message).join("; "));
    return r.data;
};
const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const uuid = z.string().uuid();
const ymd = z.string().refine((v) => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v))), "Choose a valid date.");

function requireReader(user) {
    if (!user?.active || user.mustChangePassword) fail("Sign in to continue.", 401);
}
function requireWriter(user) {
    requireReader(user);
    if (!["owner", "admin", "member"].includes(user.role)) fail("Your account cannot modify refrigerant records.", 403);
}
function requireAdmin(user) {
    requireReader(user);
    if (!["owner", "admin"].includes(user.role)) fail("Owner or Admin access is required.", 403);
}

const ruleInput = z.object({
    id: uuid.optional(),
    code: z.string().trim().min(1).max(60),
    version: z.number().int().positive().default(1),
    jurisdiction: z.string().trim().min(1).max(80).default("US-EPA-608"),
    effectiveDate: ymd.refine(Boolean, "Effective date required."),
    equipmentClass: z.enum(["comfort_cooling", "commercial_refrigeration", "industrial_process", "other"]),
    chargeThresholdTenthsOz: z.number().int().nonnegative().max(10000000),
    maxLeakRateBps: z.number().int().min(1).max(10000),
    repairDeadlineDays: z.number().int().min(1).max(365).default(30),
    sourceUrl: z.string().trim().max(500).default("https://www.epa.gov/section608/recordkeeping-and-reporting-requirements-stationary-refrigeration"),
    notes: z.string().trim().max(2000).default(""),
    active: z.boolean().default(true),
}).strict();

const refrigerantInput = z.object({
    id: uuid.optional(),
    code: z.string().trim().min(1).max(40),
    name: z.string().trim().max(120).optional(),
    gwp: z.number().int().nonnegative().max(50000).optional(),
    ozoneDepleting: z.boolean().optional(),
    active: z.boolean().optional(),
}).strict();

// Standard EPA Section 608 / IPCC AR4 100-year GWP reference table.
export const STANDARD_REFRIGERANTS = [
    { code: "R-11", name: "R-11 (CFC-11)", gwp: 4750, ozoneDepleting: true },
    { code: "R-22", name: "R-22 (HCFC-22)", gwp: 1810, ozoneDepleting: true },
    { code: "R-134A", name: "R-134a (HFC-134a)", gwp: 1430, ozoneDepleting: false },
    { code: "R-404A", name: "R-404A (HFC Blend)", gwp: 3922, ozoneDepleting: false },
    { code: "R-410A", name: "R-410A (HFC Blend)", gwp: 2088, ozoneDepleting: false },
    { code: "R-32", name: "R-32 (HFC-32)", gwp: 675, ozoneDepleting: false },
];

const EXTRA_GWP = {
    "R-454B": { code: "R-454B", name: "R-454B (HFO/HFC Blend)", gwp: 466, ozoneDepleting: false },
    "R-407C": { code: "R-407C", name: "R-407C (HFC Blend)", gwp: 1774, ozoneDepleting: false },
};

export function lookupStandardRefrigerant(rawCode) {
    const clean = String(rawCode || "").trim().toUpperCase().replace(/^R[\s-]?/, "R-");
    const norm = clean.startsWith("R-") ? clean : `R-${clean}`;
    return STANDARD_REFRIGERANTS.find((r) => r.code === norm) || EXTRA_GWP[norm] || null;
}

const cylinderInput = z.object({
    id: uuid.optional(),
    tag: z.string().trim().min(1).max(60),
    refrigerantId: uuid,
    status: z.enum(["virgin", "recovered", "reclaimed", "empty", "retired"]).default("virgin"),
    tareTenthsOz: z.number().int().nonnegative().max(1000000).default(0),
    capacityTenthsOz: z.number().int().positive().max(10000000),
    currentMassTenthsOz: z.number().int().nonnegative().max(10000000).default(0),
    locationId: uuid.nullable().default(null),
    technicianId: uuid.nullable().default(null),
    certificationRef: z.string().trim().max(120).default(""),
    supplierDocRef: z.string().trim().max(160).default(""),
}).strict();

const baselineInput = z.object({
    assetId: uuid,
    refrigerantId: uuid,
    fullChargeTenthsOz: z.number().int().positive().max(100000000).nullable(),
    circuitName: z.string().trim().min(1).max(80).default("Primary"),
    equipmentClass: z.enum(["comfort_cooling", "commercial_refrigeration", "industrial_process", "other"]).default("comfort_cooling"),
    verifiedSource: z.string().trim().max(160).default(""),
    verifiedDate: ymd.default(""),
}).strict();

const eventInput = z.object({
    requestKey: uuid,
    eventType: z.enum(["purchase", "transfer", "addition", "recovery", "return", "reclaim", "disposal", "adjustment"]),
    refrigerantId: uuid,
    cylinderId: uuid.nullable().default(null),
    assetId: uuid.nullable().default(null),
    jobId: uuid.nullable().default(null),
    technicianId: uuid.nullable().default(null),
    locationId: uuid.nullable().default(null),
    massTenthsOz: z.number().int().positive().max(10000000),
    eventAt: z.string().trim().min(10).max(40),
    reason: z.string().trim().min(5).max(2000),
    evidenceRef: z.string().trim().max(200).default(""),
    certificationRef: z.string().trim().max(120).default(""),
}).strict();

const leakInspectionInput = z.object({
    assetId: uuid,
    jobId: uuid.nullable().default(null),
    technicianId: uuid.nullable().default(null),
    kind: z.enum(["inspection", "repair", "initial_verification", "followup_verification"]),
    passed: z.boolean().default(true),
    dueDate: ymd.default(""),
    notes: z.string().trim().max(2000).default(""),
    occurredAt: z.string().trim().min(10).max(40),
}).strict();

export function createRmsService({ storage }) {
    const db = storage.database;
    migrate(db, "_rms_migrations", [{ version: 1, sql: rmsSchema }]);

    // Seed standard refrigerants with automatic EPA/IPCC AR4 GWP values if not yet present.
    const seedRef = db.prepare("INSERT OR IGNORE INTO _rms_refrigerants(id,code,name,gwp,ozone_depleting,active) VALUES(?,?,?,?,?,1)");
    for (const r of STANDARD_REFRIGERANTS) {
        seedRef.run(randomUUID(), r.code, r.name, r.gwp, Number(r.ozoneDepleting));
    }

    const replay = (user, key, fp) => {
        const prev = db.prepare("SELECT actor_id,request_hash,response_json FROM _rms_requests WHERE request_key=?").get(key);
        if (!prev) return null;
        if (prev.actor_id !== user.id) fail("This request belongs to another account.", 403);
        if (prev.request_hash !== fp) fail("Request key was already used with different RMS data.", 409);
        return JSON.parse(prev.response_json);
    };
    const ack = (key, user, fp, res) =>
        db.prepare("INSERT INTO _rms_requests(request_key,actor_id,request_hash,response_json) VALUES(?,?,?,?)").run(key, user.id, fp, JSON.stringify(res));

    // RMS-001: Regulatory rule matrix
    const listRules = (user) => {
        requireReader(user);
        return db.prepare(
            `SELECT id,code,version,jurisdiction,effective_date AS effectiveDate,equipment_class AS equipmentClass,
                    charge_threshold_tenths_oz AS chargeThresholdTenthsOz,max_leak_rate_bps AS maxLeakRateBps,
                    repair_deadline_days AS repairDeadlineDays,source_url AS sourceUrl,notes,active
             FROM _rms_rules ORDER BY active DESC,effective_date DESC,code`
        ).all().map((r) => ({ ...r, active: r.active === 1 }));
    };

    function saveRule(user, raw) {
        requireAdmin(user);
        const d = parse(ruleInput, raw);
        const id = d.id || randomUUID();
        db.prepare(
            `INSERT INTO _rms_rules(id,code,version,jurisdiction,effective_date,equipment_class,charge_threshold_tenths_oz,max_leak_rate_bps,repair_deadline_days,source_url,notes,active,created_by)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(id) DO UPDATE SET jurisdiction=excluded.jurisdiction,effective_date=excluded.effective_date,
             equipment_class=excluded.equipment_class,charge_threshold_tenths_oz=excluded.charge_threshold_tenths_oz,
             max_leak_rate_bps=excluded.max_leak_rate_bps,repair_deadline_days=excluded.repair_deadline_days,
             source_url=excluded.source_url,notes=excluded.notes,active=excluded.active`
        ).run(id, d.code, d.version, d.jurisdiction, d.effectiveDate, d.equipmentClass, d.chargeThresholdTenthsOz, d.maxLeakRateBps, d.repairDeadlineDays, d.sourceUrl, d.notes, Number(d.active), user.id);
        return { rule: listRules(user).find((r) => r.id === id) };
    }

    // RMS-002: Refrigerants & Cylinders
    const listRefrigerants = (user) => {
        requireReader(user);
        return db.prepare("SELECT id,code,name,gwp,ozone_depleting AS ozoneDepleting,active FROM _rms_refrigerants ORDER BY code").all()
            .map((r) => ({ ...r, ozoneDepleting: r.ozoneDepleting === 1, active: r.active === 1 }));
    };

    function saveRefrigerant(user, raw) {
        requireAdmin(user);
        const d = parse(refrigerantInput, raw);
        const std = lookupStandardRefrigerant(d.code);
        const code = std ? std.code : d.code.toUpperCase();
        const name = (d.name && d.name.trim()) || std?.name || code;
        const gwp = d.gwp ?? std?.gwp ?? 0;
        const ozoneDepleting = d.ozoneDepleting ?? std?.ozoneDepleting ?? false;
        const existing = db.prepare("SELECT id,active FROM _rms_refrigerants WHERE code=? COLLATE NOCASE").get(code);
        const id = d.id || existing?.id || randomUUID();
        const active = d.active ?? (existing ? existing.active === 1 : true);
        db.prepare(
            `INSERT INTO _rms_refrigerants(id,code,name,gwp,ozone_depleting,active) VALUES(?,?,?,?,?,?)
             ON CONFLICT(id) DO UPDATE SET code=excluded.code,name=excluded.name,gwp=excluded.gwp,ozone_depleting=excluded.ozone_depleting,active=excluded.active`
        ).run(id, code, name, gwp, Number(ozoneDepleting), Number(active));
        return { refrigerant: listRefrigerants(user).find((r) => r.id === id) };
    }

    function toggleRefrigerant(user, id, active) {
        requireAdmin(user);
        parse(uuid, id);
        const row = db.prepare("SELECT id,active FROM _rms_refrigerants WHERE id=?").get(id);
        if (!row) fail("Refrigerant not found.", 404);
        const next = typeof active === "boolean" ? active : row.active !== 1;
        db.prepare("UPDATE _rms_refrigerants SET active=? WHERE id=?").run(Number(next), id);
        return { refrigerant: listRefrigerants(user).find((r) => r.id === id) };
    }

    const listCylinders = (user) => {
        requireReader(user);
        return db.prepare(
            `SELECT c.id,c.tag,c.refrigerant_id AS refrigerantId,r.code AS refrigerantCode,r.name AS refrigerantName,
                    c.status,c.tare_tenths_oz AS tareTenthsOz,c.capacity_tenths_oz AS capacityTenthsOz,
                    c.current_mass_tenths_oz AS currentMassTenthsOz,c.location_id AS locationId,
                    c.technician_id AS technicianId,t.name AS technicianName,
                    c.certification_ref AS certificationRef,c.supplier_doc_ref AS supplierDocRef,c.version
             FROM _rms_cylinders c
             JOIN _rms_refrigerants r ON r.id=c.refrigerant_id
             LEFT JOIN technicians t ON t.id=c.technician_id
             ORDER BY c.tag`
        ).all().map((r) => ({ ...r }));
    };

    function saveCylinder(user, raw) {
        requireWriter(user);
        const d = parse(cylinderInput, raw);
        if (d.currentMassTenthsOz > d.capacityTenthsOz) fail("Current cylinder mass cannot exceed capacity.");
        if (!db.prepare("SELECT 1 FROM _rms_refrigerants WHERE id=?").get(d.refrigerantId)) fail("Refrigerant not found.", 404);
        const id = d.id || randomUUID();
        db.prepare(
            `INSERT INTO _rms_cylinders(id,tag,refrigerant_id,status,tare_tenths_oz,capacity_tenths_oz,current_mass_tenths_oz,location_id,technician_id,certification_ref,supplier_doc_ref,version)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,1)
             ON CONFLICT(id) DO UPDATE SET tag=excluded.tag,status=excluded.status,tare_tenths_oz=excluded.tare_tenths_oz,
             capacity_tenths_oz=excluded.capacity_tenths_oz,current_mass_tenths_oz=excluded.current_mass_tenths_oz,
             location_id=excluded.location_id,technician_id=excluded.technician_id,
             certification_ref=excluded.certification_ref,supplier_doc_ref=excluded.supplier_doc_ref,
             version=version+1,updated_at=CURRENT_TIMESTAMP`
        ).run(id, d.tag, d.refrigerantId, d.status, d.tareTenthsOz, d.capacityTenthsOz, d.currentMassTenthsOz, d.locationId, d.technicianId, d.certificationRef, d.supplierDocRef);
        return { cylinder: listCylinders(user).find((c) => c.id === id) };
    }

    // RMS-003: Equipment baseline & RMS-006 leak-rate evaluation
    function computeEquipmentStatus(assetId) {
        const base = db.prepare(
            `SELECT b.*,a.name AS assetName,a.serial_number AS serialNumber,c.name AS customerName,r.code AS refrigerantCode
             FROM _rms_equipment_baselines b
             JOIN assets a ON a.id=b.asset_id
             JOIN customers c ON c.id=a.customer_id
             JOIN _rms_refrigerants r ON r.id=b.refrigerant_id
             WHERE b.asset_id=?`
        ).get(assetId);
        if (!base) return null;
        const since = new Date(Date.now() - 365 * 86400000).toISOString();
        const add12m = db.prepare(
            "SELECT COALESCE(SUM(mass_tenths_oz),0) AS m FROM _rms_events WHERE asset_id=? AND event_type='addition' AND event_at>=?"
        ).get(assetId, since).m || 0;
        const rec12m = db.prepare(
            "SELECT COALESCE(SUM(mass_tenths_oz),0) AS m FROM _rms_events WHERE asset_id=? AND event_type='recovery' AND event_at>=?"
        ).get(assetId, since).m || 0;
        const activeRule = db.prepare(
            "SELECT * FROM _rms_rules WHERE equipment_class=? AND active=1 ORDER BY effective_date DESC,version DESC LIMIT 1"
        ).get(base.equipment_class);

        // Missing/unknown full charge MUST NOT fabricate a leak rate
        let leakRateBps = null;
        let thresholdExceeded = false;
        let status = "unknown_charge";
        if (base.full_charge_tenths_oz != null && base.full_charge_tenths_oz > 0) {
            leakRateBps = Math.round((add12m / base.full_charge_tenths_oz) * 10000);
            if (activeRule && base.full_charge_tenths_oz >= activeRule.charge_threshold_tenths_oz) {
                thresholdExceeded = leakRateBps > activeRule.max_leak_rate_bps;
                status = thresholdExceeded ? "leak_exceeded" : "within_threshold";
            } else {
                status = "below_rule_threshold";
            }
        }
        return {
            assetId: base.asset_id,
            assetName: base.assetName,
            serialNumber: base.serialNumber,
            customerName: base.customerName,
            refrigerantId: base.refrigerant_id,
            refrigerantCode: base.refrigerantCode,
            fullChargeTenthsOz: base.full_charge_tenths_oz,
            circuitName: base.circuit_name,
            equipmentClass: base.equipment_class,
            verifiedSource: base.verified_source,
            verifiedDate: base.verified_date,
            additions12mTenthsOz: add12m,
            recoveries12mTenthsOz: rec12m,
            leakRateBps,
            leakRatePct: leakRateBps == null ? null : Math.round(leakRateBps / 10) / 10,
            ruleApplied: activeRule ? { id: activeRule.id, code: activeRule.code, version: activeRule.version, maxLeakRateBps: activeRule.max_leak_rate_bps } : null,
            thresholdExceeded,
            status,
        };
    }

    function saveBaseline(user, raw) {
        requireWriter(user);
        const d = parse(baselineInput, raw);
        if (!db.prepare("SELECT 1 FROM assets WHERE id=?").get(d.assetId)) fail("Equipment asset not found.", 404);
        if (!db.prepare("SELECT 1 FROM _rms_refrigerants WHERE id=?").get(d.refrigerantId)) fail("Refrigerant not found.", 404);
        db.prepare(
            `INSERT INTO _rms_equipment_baselines(asset_id,refrigerant_id,full_charge_tenths_oz,circuit_name,equipment_class,verified_source,verified_date,version,updated_by)
             VALUES(?,?,?,?,?,?,?,1,?)
             ON CONFLICT(asset_id) DO UPDATE SET refrigerant_id=excluded.refrigerant_id,full_charge_tenths_oz=excluded.full_charge_tenths_oz,
             circuit_name=excluded.circuit_name,equipment_class=excluded.equipment_class,verified_source=excluded.verified_source,
             verified_date=excluded.verified_date,version=version+1,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`
        ).run(d.assetId, d.refrigerantId, d.fullChargeTenthsOz, d.circuitName, d.equipmentClass, d.verifiedSource, d.verifiedDate, user.id);
        return { baseline: computeEquipmentStatus(d.assetId) };
    }

    // RMS-004 & RMS-005: Balanced field events & cylinder reconciliation
    function recordEvent(user, raw) {
        requireWriter(user);
        const d = parse(eventInput, raw);
        const fp = hash({ action: "rms_event", ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fp); if (prior) return prior;
            if (!db.prepare("SELECT 1 FROM _rms_refrigerants WHERE id=?").get(d.refrigerantId)) fail("Refrigerant not found.", 404);
            if (d.assetId && !db.prepare("SELECT 1 FROM assets WHERE id=?").get(d.assetId)) fail("Equipment asset not found.", 404);
            if (d.jobId && !db.prepare("SELECT 1 FROM jobs WHERE id=?").get(d.jobId)) fail("Job not found.", 404);

            // Prevent refrigerant mixing on cylinder or equipment baseline
            if (d.cylinderId) {
                const cyl = db.prepare("SELECT * FROM _rms_cylinders WHERE id=?").get(d.cylinderId);
                if (!cyl) fail("Cylinder not found.", 404);
                if (cyl.refrigerant_id !== d.refrigerantId)
                    fail("Refrigerant mismatch: cannot mix different refrigerants in the same cylinder.", 409);
                if (["addition", "reclaim", "disposal", "return"].includes(d.eventType)) {
                    if (cyl.current_mass_tenths_oz < d.massTenthsOz)
                        fail(`Insufficient refrigerant in cylinder ${cyl.tag} (${cyl.current_mass_tenths_oz / 10} oz available).`, 409);
                    const nextMass = cyl.current_mass_tenths_oz - d.massTenthsOz;
                    const nextStatus = nextMass === 0 ? "empty" : cyl.status;
                    db.prepare("UPDATE _rms_cylinders SET current_mass_tenths_oz=?,status=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(nextMass, nextStatus, cyl.id);
                } else if (["purchase", "recovery"].includes(d.eventType)) {
                    if (cyl.current_mass_tenths_oz + d.massTenthsOz > cyl.capacity_tenths_oz)
                        fail(`Cylinder ${cyl.tag} capacity exceeded.`, 409);
                    const nextMass = cyl.current_mass_tenths_oz + d.massTenthsOz;
                    const nextStatus = d.eventType === "recovery" ? "recovered" : cyl.status;
                    db.prepare("UPDATE _rms_cylinders SET current_mass_tenths_oz=?,status=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(nextMass, nextStatus, cyl.id);
                } else if (d.eventType === "transfer" && d.locationId) {
                    db.prepare("UPDATE _rms_cylinders SET location_id=?,technician_id=COALESCE(?,technician_id),version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(d.locationId, d.technicianId, cyl.id);
                }
            }
            if (d.assetId) {
                const base = db.prepare("SELECT refrigerant_id FROM _rms_equipment_baselines WHERE asset_id=?").get(d.assetId);
                if (base && base.refrigerant_id !== d.refrigerantId)
                    fail("Refrigerant mismatch: event refrigerant does not match equipment baseline.", 409);
            }

            const id = randomUUID();
            db.prepare(
                `INSERT INTO _rms_events(id,request_key,event_type,refrigerant_id,cylinder_id,asset_id,job_id,technician_id,location_id,mass_tenths_oz,event_at,reason,evidence_ref,certification_ref,actor_id)
                 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
            ).run(id, d.requestKey, d.eventType, d.refrigerantId, d.cylinderId, d.assetId, d.jobId, d.technicianId, d.locationId, d.massTenthsOz, d.eventAt, d.reason, d.evidenceRef, d.certificationRef, user.id);

            const ev = db.prepare("SELECT id,event_type AS eventType,refrigerant_id AS refrigerantId,cylinder_id AS cylinderId,asset_id AS assetId,job_id AS jobId,mass_tenths_oz AS massTenthsOz,event_at AS eventAt,reason FROM _rms_events WHERE id=?").get(id);
            const res = { event: { ...ev }, equipment: d.assetId ? computeEquipmentStatus(d.assetId) : null };
            ack(d.requestKey, user, fp, res);
            return res;
        });
    }

    function recordLeakInspection(user, raw) {
        requireWriter(user);
        const d = parse(leakInspectionInput, raw);
        const eq = computeEquipmentStatus(d.assetId);
        if (!eq) fail("Configure equipment refrigerant baseline before recording a leak inspection.", 409);
        const id = randomUUID();
        db.prepare(
            `INSERT INTO _rms_leak_inspections(id,asset_id,job_id,technician_id,kind,rule_id,calculated_leak_rate_bps,passed,due_date,notes,actor_id,occurred_at)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(id, d.assetId, d.jobId, d.technicianId, d.kind, eq.ruleApplied?.id || null, eq.leakRateBps, Number(d.passed), d.dueDate, d.notes, user.id, d.occurredAt);
        return { inspection: { id, assetId: d.assetId, kind: d.kind, passed: d.passed, leakRateBps: eq.leakRateBps, ruleApplied: eq.ruleApplied } };
    }

    // RMS-007 & RMS-008: Dashboard & Export
    function dashboard(user) {
        requireReader(user);
        const refrigerants = listRefrigerants(user);
        const cylinders = listCylinders(user);
        const rules = listRules(user);
        const baselineIds = db.prepare("SELECT asset_id FROM _rms_equipment_baselines").all().map((r) => r.asset_id);
        const equipment = baselineIds.map(computeEquipmentStatus).filter(Boolean);
        const recentEvents = db.prepare(
            `SELECT e.id,e.event_type AS eventType,r.code AS refrigerantCode,c.tag AS cylinderTag,a.name AS assetName,
                    e.mass_tenths_oz AS massTenthsOz,e.event_at AS eventAt,e.reason,e.actor_id AS actorId
             FROM _rms_events e
             JOIN _rms_refrigerants r ON r.id=e.refrigerant_id
             LEFT JOIN _rms_cylinders c ON c.id=e.cylinder_id
             LEFT JOIN assets a ON a.id=e.asset_id
             ORDER BY e.event_at DESC,e.created_at DESC LIMIT 100`
        ).all().map((r) => ({ ...r }));

        const stockByRefrigerant = refrigerants.filter((r) => r.active).map((ref) => {
            const matching = cylinders.filter((c) => c.refrigerantId === ref.id);
            const virginTenthsOz = matching.filter((c) => c.status === "virgin" || c.status === "reclaimed").reduce((s, c) => s + c.currentMassTenthsOz, 0);
            const recoveredTenthsOz = matching.filter((c) => c.status === "recovered").reduce((s, c) => s + c.currentMassTenthsOz, 0);
            return { refrigerantId: ref.id, code: ref.code, name: ref.name, gwp: ref.gwp, ozoneDepleting: ref.ozoneDepleting, cylinderCount: matching.length, virginTenthsOz, recoveredTenthsOz };
        });

        const totalAddedTenthsOz = db.prepare("SELECT COALESCE(SUM(mass_tenths_oz),0) AS m FROM _rms_events WHERE event_type='addition'").get().m;
        const totalRecoveredTenthsOz = db.prepare("SELECT COALESCE(SUM(mass_tenths_oz),0) AS m FROM _rms_events WHERE event_type='recovery'").get().m;

        return {
            computedAt: new Date().toISOString(),
            disclaimer: "Supports EPA Section 608 / AIM Act recordkeeping; generating reports is distinct from regulatory filing and does not constitute an automatic compliance claim.",
            kpis: {
                cylindersTotal: cylinders.length,
                equipmentTracked: equipment.length,
                unknownChargeCount: equipment.filter((e) => e.status === "unknown_charge").length,
                leakExceededCount: equipment.filter((e) => e.thresholdExceeded).length,
                totalAddedTenthsOz,
                totalRecoveredTenthsOz,
            },
            stockByRefrigerant,
            refrigerants,
            cylinders,
            equipment,
            rules,
            recentEvents,
        };
    }

    function exportRecords(user, format = "json") {
        requireReader(user);
        const data = dashboard(user);
        if (format === "csv") {
            const headers = ["id", "eventAt", "eventType", "refrigerantCode", "cylinderTag", "assetName", "massOz", "reason", "actorId"];
            const esc = (v) => {
                const s = v == null ? "" : String(v);
                return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            };
            const lines = [headers.join(","), ...data.recentEvents.map((e) => [e.id, e.eventAt, e.eventType, e.refrigerantCode, e.cylinderTag || "", e.assetName || "", (e.massTenthsOz / 10).toFixed(1), e.reason, e.actorId].map(esc).join(","))];
            return { format: "csv", filename: "rms-refrigerant-ledger.csv", body: lines.join("\n"), generatedAt: data.computedAt };
        }
        return { format: "json", ...data };
    }

    return {
        dashboard, exportRecords,
        listRules, saveRule,
        listRefrigerants, saveRefrigerant, toggleRefrigerant,
        listCylinders, saveCylinder,
        saveBaseline, computeEquipmentStatus,
        recordEvent, recordLeakInspection,
    };
}
