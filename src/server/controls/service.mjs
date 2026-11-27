import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { migrate, transaction } from "../platform/sqlite.mjs";
import { controlsSchemaV1 } from "./schema.mjs";

export class ControlsError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const uuid = z.string().uuid();
const fail = (m, s = 400) => {
  throw new ControlsError(m, s);
};
const parse = (schema, raw) => {
  const r = schema.safeParse(raw);
  if (!r.success) fail(r.error.issues[0]?.message || "Invalid controls payload.");
  return r.data;
};
const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const isAdmin = (u) => !!u?.active && ["owner", "admin"].includes(u.role);
const isWriter = (u) => !!u?.active && u.role !== "viewer";
const requireReader = (u) => {
  if (!u?.active) fail("Sign in to access Controls.", 401);
};
const requireWriter = (u) => {
  requireReader(u);
  if (!isWriter(u)) fail("Write access required for Controls.", 403);
};
const requireApprover = (u) => {
  requireReader(u);
  if (!isAdmin(u)) fail("Owner or administrator sign-off is required.", 403);
};

const systemInput = z.object({
  requestKey: uuid,
  customerId: uuid,
  siteName: z.string().trim().max(160).default(""),
  buildingName: z.string().trim().min(1).max(160),
  systemName: z.string().trim().min(1).max(160),
  systemType: z.string().trim().min(1).max(60).default("hvac_bas"),
  status: z.enum(["active", "commissioning", "decommissioned"]).default("commissioning"),
  notes: z.string().trim().max(2000).default(""),
}).strict();

const controllerInput = z.object({
  requestKey: uuid,
  systemId: uuid,
  assetId: uuid.nullable().optional().default(null),
  tag: z.string().trim().min(1).max(80),
  manufacturer: z.string().trim().max(120).default(""),
  model: z.string().trim().max(120).default(""),
  protocol: z.enum(["BACnet/IP", "BACnet/MSTP", "Modbus TCP", "Modbus RTU", "LonWorks", "Proprietary"]).default("BACnet/IP"),
  networkAddress: z.string().trim().max(120).default(""),
  deviceInstance: z.string().trim().max(60).default(""),
  pointCount: z.number().int().min(0).max(50000).default(0),
  firmwareVersion: z.string().trim().max(80).default(""),
  softwareVersion: z.string().trim().max(80).default(""),
  secretRef: z.string().trim().max(160).default(""),
  status: z.enum(["active", "commissioning", "replaced", "retired"]).default("commissioning"),
}).strict();

const moveControllerInput = z.object({
  requestKey: uuid,
  eventType: z.enum(["moved", "replaced", "firmware_updated"]),
  toSystemId: uuid.optional(),
  firmwareVersion: z.string().trim().max(80).optional(),
  notes: z.string().trim().min(3).max(1000),
}).strict();

const checkoutInput = z.object({
  requestKey: uuid,
  controllerId: uuid,
  jobId: uuid.nullable().optional().default(null),
  templateVersion: z.string().trim().min(1).max(40).default("v1.0"),
  testType: z.enum(["point_to_point", "sequence_of_ops", "functional_test", "trend_review"]).default("point_to_point"),
  readings: z.array(z.object({
    point: z.string().trim().min(1).max(120),
    expected: z.string().trim().max(120).default(""),
    actual: z.string().trim().max(120).default(""),
    pass: z.boolean().default(true),
  })).max(200).default([]),
  evidenceNotes: z.string().trim().max(2000).default(""),
  status: z.enum(["draft", "submitted"]).default("submitted"),
}).strict();

const reviewCheckoutInput = z.object({
  requestKey: uuid,
  decision: z.enum(["approved", "rejected"]),
  signoffNotes: z.string().trim().min(3).max(1000),
}).strict();

const artifactInput = z.object({
  requestKey: uuid,
  systemId: uuid,
  controllerId: uuid.nullable().optional().default(null),
  kind: z.enum(["drawing", "backup", "sequence_doc", "submittal"]),
  filename: z.string().trim().min(1).max(200),
  contentDigestSeed: z.string().max(10000).optional(),
  sha256: z.string().trim().regex(/^[a-fA-F0-9]{64}$/).optional(),
  provenance: z.string().trim().max(300).default("Field upload"),
  retentionPolicy: z.string().trim().max(60).default("7_years"),
  storageRef: z.string().trim().max(300).default(""),
  approved: z.boolean().default(false),
}).strict();

const deficiencyInput = z.object({
  requestKey: uuid,
  systemId: uuid,
  controllerId: uuid.nullable().optional().default(null),
  checkoutId: uuid.nullable().optional().default(null),
  severity: z.enum(["critical", "major", "minor", "observation"]).default("major"),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).default(""),
  evidenceRef: z.string().trim().max(300).default(""),
  ownerName: z.string().trim().max(120).default(""),
}).strict();

const correctiveJobInput = z.object({
  requestKey: uuid,
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduledTime: z.string().trim().max(10).default("09:00"),
  technicianId: uuid.nullable().optional().default(null),
}).strict();

const closeDeficiencyInput = z.object({
  requestKey: uuid,
  retestNotes: z.string().trim().min(3).max(1000),
}).strict();

const maintLinkInput = z.object({
  requestKey: uuid,
  controllerId: uuid,
  jobId: uuid.nullable().optional().default(null),
  templateName: z.string().trim().min(1).max(160),
  templateVersion: z.string().trim().min(1).max(40),
  notes: z.string().trim().max(1000).default(""),
}).strict();

export function createControlsService({ storage }) {
  const db = storage.database;
  migrate(db, "_ctrl_migrations", [{ version: 1, sql: controlsSchemaV1 }]);

  const replay = (user, key, fp) => {
    const row = db
      .prepare("SELECT fingerprint, response_json FROM _ctrl_idempotency WHERE request_key=? AND actor_id=?")
      .get(key, user.id);
    if (!row) return null;
    if (row.fingerprint !== fp) fail("Request key was already used with different data.", 409);
    return JSON.parse(row.response_json);
  };
  const ack = (key, user, fp, res) =>
    db
      .prepare("INSERT INTO _ctrl_idempotency(request_key,actor_id,fingerprint,response_json) VALUES(?,?,?,?)")
      .run(key, user.id, fp, JSON.stringify(res));

  const checkSystem = (id) => {
    const row = db.prepare("SELECT * FROM _ctrl_systems WHERE id=?").get(id);
    if (!row) fail("Building/system record not found.", 404);
    return { ...row };
  };
  const checkController = (id) => {
    const row = db.prepare("SELECT * FROM _ctrl_controllers WHERE id=?").get(id);
    if (!row) fail("Controller not found.", 404);
    return { ...row };
  };

  function summary(user) {
    requireReader(user);
    return {
      systems: db.prepare("SELECT COUNT(*) AS n FROM _ctrl_systems").get().n,
      controllers: db.prepare("SELECT COUNT(*) AS n FROM _ctrl_controllers").get().n,
      pendingCheckouts: db.prepare("SELECT COUNT(*) AS n FROM _ctrl_checkouts WHERE status IN ('draft','submitted')").get().n,
      approvedCheckouts: db.prepare("SELECT COUNT(*) AS n FROM _ctrl_checkouts WHERE status='approved'").get().n,
      artifacts: db.prepare("SELECT COUNT(*) AS n FROM _ctrl_artifacts").get().n,
      openDeficiencies: db.prepare("SELECT COUNT(*) AS n FROM _ctrl_deficiencies WHERE status<>'closed'").get().n,
    };
  }

  function listSystems(user) {
    requireReader(user);
    return db
      .prepare(
        `SELECT s.*, c.name AS customer_name,
          (SELECT COUNT(*) FROM _ctrl_controllers k WHERE k.system_id=s.id) AS controller_count,
          (SELECT COUNT(*) FROM _ctrl_deficiencies d WHERE d.system_id=s.id AND d.status<>'closed') AS open_deficiencies
         FROM _ctrl_systems s
         JOIN customers c ON c.id=s.customer_id
         ORDER BY s.created_at DESC LIMIT 200`,
      )
      .all()
      .map((r) => ({ ...r }));
  }

  function createSystem(user, raw) {
    requireWriter(user);
    const d = parse(systemInput, raw);
    const fp = hash({ action: "ctrl_create_system", ...d });
    return transaction(db, () => {
      const prior = replay(user, d.requestKey, fp);
      if (prior) return prior;
      const cust = db.prepare("SELECT id FROM customers WHERE id=?").get(d.customerId);
      if (!cust) fail("Customer not found.", 404);
      const id = randomUUID();
      db.prepare(
        `INSERT INTO _ctrl_systems(id,customer_id,site_name,building_name,system_name,system_type,status,notes,created_by)
         VALUES(?,?,?,?,?,?,?,?,?)`,
      ).run(id, d.customerId, d.siteName, d.buildingName, d.systemName, d.systemType, d.status, d.notes, user.id);
      const res = { system: listSystems(user).find((s) => s.id === id) };
      ack(d.requestKey, user, fp, res);
      return res;
    });
  }

  function listControllers(user, systemId) {
    requireReader(user);
    const sql = systemId
      ? `SELECT k.*, s.building_name, s.system_name, c.name AS customer_name
         FROM _ctrl_controllers k
         JOIN _ctrl_systems s ON s.id=k.system_id
         JOIN customers c ON c.id=s.customer_id
         WHERE k.system_id=? ORDER BY k.tag`
      : `SELECT k.*, s.building_name, s.system_name, c.name AS customer_name
         FROM _ctrl_controllers k
         JOIN _ctrl_systems s ON s.id=k.system_id
         JOIN customers c ON c.id=s.customer_id
         ORDER BY k.created_at DESC LIMIT 300`;
    return (systemId ? db.prepare(sql).all(systemId) : db.prepare(sql).all()).map((r) => ({ ...r }));
  }

  function createController(user, raw) {
    requireWriter(user);
    const d = parse(controllerInput, raw);
    if (/password\s*[:=]/i.test(d.networkAddress) || /password\s*[:=]/i.test(d.secretRef)) {
      fail("Do not store plaintext passwords in network fields; store a vault/secret reference key instead.", 400);
    }
    const fp = hash({ action: "ctrl_create_controller", ...d });
    return transaction(db, () => {
      const prior = replay(user, d.requestKey, fp);
      if (prior) return prior;
      const sys = checkSystem(d.systemId);
      const id = randomUUID();
      db.prepare(
        `INSERT INTO _ctrl_controllers(id,system_id,asset_id,tag,manufacturer,model,protocol,network_address,device_instance,point_count,firmware_version,software_version,secret_ref,status,created_by)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        d.systemId,
        d.assetId,
        d.tag,
        d.manufacturer,
        d.model,
        d.protocol,
        d.networkAddress,
        d.deviceInstance,
        d.pointCount,
        d.firmwareVersion,
        d.softwareVersion,
        d.secretRef,
        d.status,
        user.id,
      );
      db.prepare(
        "INSERT INTO _ctrl_history(id,controller_id,event_type,from_location,to_location,notes,actor_id) VALUES(?,?,'installed','',?,?,?)",
      ).run(randomUUID(), id, `${sys.building_name} / ${sys.system_name}`, `Registered ${d.tag} (${d.protocol})`, user.id);
      const res = { controller: listControllers(user).find((k) => k.id === id) };
      ack(d.requestKey, user, fp, res);
      return res;
    });
  }

  function moveOrReplaceController(user, controllerId, raw) {
    requireWriter(user);
    parse(uuid, controllerId);
    const d = parse(moveControllerInput, raw);
    const fp = hash({ action: "ctrl_move_controller", controllerId, ...d });
    return transaction(db, () => {
      const prior = replay(user, d.requestKey, fp);
      if (prior) return prior;
      const ctrl = checkController(controllerId);
      const fromSys = checkSystem(ctrl.system_id);
      let toLoc = `${fromSys.building_name} / ${fromSys.system_name}`;
      if (d.eventType === "moved") {
        if (!d.toSystemId) fail("Select a destination system when moving a controller.");
        const toSys = checkSystem(d.toSystemId);
        toLoc = `${toSys.building_name} / ${toSys.system_name}`;
        db.prepare("UPDATE _ctrl_controllers SET system_id=? WHERE id=?").run(d.toSystemId, controllerId);
      } else if (d.eventType === "replaced") {
        db.prepare("UPDATE _ctrl_controllers SET status='replaced' WHERE id=?").run(controllerId);
      } else if (d.eventType === "firmware_updated" && d.firmwareVersion) {
        db.prepare("UPDATE _ctrl_controllers SET firmware_version=? WHERE id=?").run(d.firmwareVersion, controllerId);
      }
      db.prepare(
        "INSERT INTO _ctrl_history(id,controller_id,event_type,from_location,to_location,notes,actor_id) VALUES(?,?,?,?,?,?,?)",
      ).run(randomUUID(), controllerId, d.eventType, `${fromSys.building_name} / ${fromSys.system_name}`, toLoc, d.notes, user.id);
      const history = db.prepare("SELECT * FROM _ctrl_history WHERE controller_id=? ORDER BY created_at DESC").all(controllerId).map((r) => ({ ...r }));
      const res = { controller: listControllers(user).find((k) => k.id === controllerId), history };
      ack(d.requestKey, user, fp, res);
      return res;
    });
  }

  function listCheckouts(user) {
    requireReader(user);
    return db
      .prepare(
        `SELECT ch.*, k.tag AS controller_tag, s.building_name, s.system_name
         FROM _ctrl_checkouts ch
         JOIN _ctrl_controllers k ON k.id=ch.controller_id
         JOIN _ctrl_systems s ON s.id=k.system_id
         ORDER BY ch.created_at DESC LIMIT 200`,
      )
      .all()
      .map((r) => ({ ...r, readings: JSON.parse(r.readings_json || "[]") }));
  }

  function createCheckout(user, raw) {
    requireWriter(user);
    const d = parse(checkoutInput, raw);
    const fp = hash({ action: "ctrl_create_checkout", ...d });
    return transaction(db, () => {
      const prior = replay(user, d.requestKey, fp);
      if (prior) return prior;
      checkController(d.controllerId);
      const id = randomUUID();
      db.prepare(
        `INSERT INTO _ctrl_checkouts(id,controller_id,job_id,template_version,test_type,readings_json,evidence_notes,status,technician_id)
         VALUES(?,?,?,?,?,?,?,?,?)`,
      ).run(id, d.controllerId, d.jobId, d.templateVersion, d.testType, JSON.stringify(d.readings), d.evidenceNotes, d.status, user.id);
      const res = { checkout: listCheckouts(user).find((c) => c.id === id) };
      ack(d.requestKey, user, fp, res);
      return res;
    });
  }

  function reviewCheckout(user, checkoutId, raw) {
    requireApprover(user);
    parse(uuid, checkoutId);
    const d = parse(reviewCheckoutInput, raw);
    const fp = hash({ action: "ctrl_review_checkout", checkoutId, ...d });
    return transaction(db, () => {
      const prior = replay(user, d.requestKey, fp);
      if (prior) return prior;
      const cur = db.prepare("SELECT * FROM _ctrl_checkouts WHERE id=?").get(checkoutId);
      if (!cur) fail("Checkout sheet not found.", 404);
      db.prepare(
        "UPDATE _ctrl_checkouts SET status=?, reviewed_by=?, reviewed_at=datetime('now'), signoff_notes=? WHERE id=?",
      ).run(d.decision, user.id, d.signoffNotes, checkoutId);
      const res = { checkout: listCheckouts(user).find((c) => c.id === checkoutId) };
      ack(d.requestKey, user, fp, res);
      return res;
    });
  }

  function listArtifacts(user) {
    requireReader(user);
    return db
      .prepare(
        `SELECT a.*, s.building_name, s.system_name, k.tag AS controller_tag
         FROM _ctrl_artifacts a
         JOIN _ctrl_systems s ON s.id=a.system_id
         LEFT JOIN _ctrl_controllers k ON k.id=a.controller_id
         ORDER BY a.created_at DESC LIMIT 200`,
      )
      .all()
      .map((r) => ({ ...r, approved: r.approved === 1 }));
  }

  function createArtifact(user, raw) {
    requireWriter(user);
    const d = parse(artifactInput, raw);
    const fp = hash({ action: "ctrl_create_artifact", ...d });
    return transaction(db, () => {
      const prior = replay(user, d.requestKey, fp);
      if (prior) return prior;
      checkSystem(d.systemId);
      if (d.controllerId) checkController(d.controllerId);
      const prev = db
        .prepare("SELECT MAX(version) AS maxv FROM _ctrl_artifacts WHERE system_id=? AND lower(filename)=lower(?)")
        .get(d.systemId, d.filename);
      const nextVer = (prev?.maxv || 0) + 1;
      const digest =
        d.sha256 ||
        createHash("sha256")
          .update(`${d.systemId}:${d.filename}:v${nextVer}:${d.contentDigestSeed || d.storageRef || d.provenance}`)
          .digest("hex");
      const approvedFlag = d.approved && isAdmin(user) ? 1 : 0;
      const id = randomUUID();
      db.prepare(
        `INSERT INTO _ctrl_artifacts(id,system_id,controller_id,kind,filename,version,sha256,provenance,retention_policy,storage_ref,approved,uploaded_by)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        d.systemId,
        d.controllerId,
        d.kind,
        d.filename,
        nextVer,
        digest,
        d.provenance,
        d.retentionPolicy,
        d.storageRef || `controls/${d.systemId}/v${nextVer}-${d.filename}`,
        approvedFlag,
        user.id,
      );
      const res = { artifact: listArtifacts(user).find((a) => a.id === id) };
      ack(d.requestKey, user, fp, res);
      return res;
    });
  }

  function listDeficiencies(user) {
    requireReader(user);
    return db
      .prepare(
        `SELECT d.*, s.building_name, s.system_name, k.tag AS controller_tag, j.identifier AS corrective_job_identifier
         FROM _ctrl_deficiencies d
         JOIN _ctrl_systems s ON s.id=d.system_id
         LEFT JOIN _ctrl_controllers k ON k.id=d.controller_id
         LEFT JOIN jobs j ON j.id=d.corrective_job_id
         ORDER BY CASE d.status WHEN 'closed' THEN 1 ELSE 0 END, d.created_at DESC LIMIT 200`,
      )
      .all()
      .map((r) => ({ ...r }));
  }

  function createDeficiency(user, raw) {
    requireWriter(user);
    const d = parse(deficiencyInput, raw);
    const fp = hash({ action: "ctrl_create_deficiency", ...d });
    return transaction(db, () => {
      const prior = replay(user, d.requestKey, fp);
      if (prior) return prior;
      checkSystem(d.systemId);
      if (d.controllerId) checkController(d.controllerId);
      const id = randomUUID();
      db.prepare(
        `INSERT INTO _ctrl_deficiencies(id,system_id,controller_id,checkout_id,severity,title,description,evidence_ref,owner_name,created_by)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
      ).run(id, d.systemId, d.controllerId, d.checkoutId, d.severity, d.title, d.description, d.evidenceRef, d.ownerName, user.id);
      const res = { deficiency: listDeficiencies(user).find((x) => x.id === id) };
      ack(d.requestKey, user, fp, res);
      return res;
    });
  }

  function scheduleCorrectiveJob(user, deficiencyId, raw) {
    requireWriter(user);
    parse(uuid, deficiencyId);
    const d = parse(correctiveJobInput, raw);
    const fp = hash({ action: "ctrl_corrective_job", deficiencyId, ...d });
    return transaction(db, () => {
      const prior = replay(user, d.requestKey, fp);
      if (prior) return prior;
      const def = db.prepare("SELECT * FROM _ctrl_deficiencies WHERE id=?").get(deficiencyId);
      if (!def) fail("Deficiency not found.", 404);
      if (def.status === "closed") fail("Cannot schedule corrective work on a closed deficiency.", 409);
      const sys = checkSystem(def.system_id);
      const cust = db.prepare("SELECT address FROM customers WHERE id=?").get(sys.customer_id);
      const jobId = randomUUID();
      const jobIdent = "CTRL-" + String(Date.now()).slice(-6);
      const prio = def.severity === "critical" ? "urgent" : def.severity === "major" ? "high" : "normal";
      db.prepare(
        "INSERT INTO jobs(id,identifier,customer_id,technician_id,scheduled_date,scheduled_time,status,priority,address,notes) VALUES(?,?,?,?,?,?,'confirmed',?,?,?)",
      ).run(
        jobId,
        jobIdent,
        sys.customer_id,
        d.technicianId,
        d.scheduledDate,
        d.scheduledTime,
        prio,
        cust?.address || "",
        `[Controls Deficiency] ${def.title} — ${def.description}`,
      );
      db.prepare("UPDATE _ctrl_deficiencies SET corrective_job_id=?, status='in_progress' WHERE id=?").run(jobId, deficiencyId);
      const res = { deficiency: listDeficiencies(user).find((x) => x.id === deficiencyId), jobId, jobIdentifier: jobIdent };
      ack(d.requestKey, user, fp, res);
      return res;
    });
  }

  function closeDeficiency(user, deficiencyId, raw) {
    requireApprover(user);
    parse(uuid, deficiencyId);
    const d = parse(closeDeficiencyInput, raw);
    const fp = hash({ action: "ctrl_close_deficiency", deficiencyId, ...d });
    return transaction(db, () => {
      const prior = replay(user, d.requestKey, fp);
      if (prior) return prior;
      const def = db.prepare("SELECT * FROM _ctrl_deficiencies WHERE id=?").get(deficiencyId);
      if (!def) fail("Deficiency not found.", 404);
      db.prepare(
        "UPDATE _ctrl_deficiencies SET status='closed', retest_notes=?, closed_by=?, closed_at=datetime('now') WHERE id=?",
      ).run(d.retestNotes, user.id, deficiencyId);
      const res = { deficiency: listDeficiencies(user).find((x) => x.id === deficiencyId) };
      ack(d.requestKey, user, fp, res);
      return res;
    });
  }

  function listMaintLinks(user) {
    requireReader(user);
    return db
      .prepare(
        `SELECT m.*, k.tag AS controller_tag, s.building_name, s.system_name, j.identifier AS job_identifier
         FROM _ctrl_maint_links m
         JOIN _ctrl_controllers k ON k.id=m.controller_id
         JOIN _ctrl_systems s ON s.id=k.system_id
         LEFT JOIN jobs j ON j.id=m.job_id
         ORDER BY m.completed_at DESC LIMIT 200`,
      )
      .all()
      .map((r) => ({ ...r }));
  }

  function recordMaintLink(user, raw) {
    requireWriter(user);
    const d = parse(maintLinkInput, raw);
    const fp = hash({ action: "ctrl_maint_link", ...d });
    return transaction(db, () => {
      const prior = replay(user, d.requestKey, fp);
      if (prior) return prior;
      checkController(d.controllerId);
      const id = randomUUID();
      db.prepare(
        `INSERT INTO _ctrl_maint_links(id,controller_id,job_id,template_name,template_version,notes,completed_by)
         VALUES(?,?,?,?,?,?,?)`,
      ).run(id, d.controllerId, d.jobId, d.templateName, d.templateVersion, d.notes, user.id);
      const res = { link: listMaintLinks(user).find((x) => x.id === id) };
      ack(d.requestKey, user, fp, res);
      return res;
    });
  }

  function handoverPackage(user, systemId) {
    requireReader(user);
    parse(uuid, systemId);
    const sys = checkSystem(systemId);
    const customer = db.prepare("SELECT id, name, phone, email, address FROM customers WHERE id=?").get(sys.customer_id);
    const controllers = listControllers(user, systemId);
    const ctrlIds = controllers.map((c) => c.id);
    const checkouts = listCheckouts(user).filter((ch) => ctrlIds.includes(ch.controller_id));
    const artifacts = listArtifacts(user).filter((a) => a.system_id === systemId);
    const deficiencies = listDeficiencies(user).filter((d) => d.system_id === systemId);
    const maintenanceHistory = listMaintLinks(user).filter((m) => ctrlIds.includes(m.controller_id));
    const history = ctrlIds.length
      ? db
          .prepare(`SELECT * FROM _ctrl_history WHERE controller_id IN (${ctrlIds.map(() => "?").join(",")}) ORDER BY created_at DESC`)
          .all(...ctrlIds)
          .map((r) => ({ ...r }))
      : [];
    return {
      generatedAt: new Date().toISOString(),
      generatedBy: user.id,
      system: sys,
      customer: customer ? { ...customer } : null,
      controllers,
      approvedArtifacts: artifacts.filter((a) => a.approved),
      allArtifacts: artifacts,
      approvedCheckouts: checkouts.filter((c) => c.status === "approved"),
      allCheckouts: checkouts,
      openDeficiencies: deficiencies.filter((d) => d.status !== "closed"),
      closedDeficiencies: deficiencies.filter((d) => d.status === "closed"),
      maintenanceHistory,
      controllerHistory: history,
    };
  }

  return {
    summary,
    listSystems,
    createSystem,
    listControllers,
    createController,
    moveOrReplaceController,
    listCheckouts,
    createCheckout,
    reviewCheckout,
    listArtifacts,
    createArtifact,
    listDeficiencies,
    createDeficiency,
    scheduleCorrectiveJob,
    closeDeficiency,
    listMaintLinks,
    recordMaintLink,
    handoverPackage,
  };
}
