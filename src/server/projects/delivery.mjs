import { createHash } from "node:crypto";
import { transaction } from "../platform/sqlite.mjs";
import {
    parse, uuid, reader, writer, approver, fail,
    fieldDocInput, crewInput, crewMemberInput, crewTimeInput, reviewDecisionInput,
    changeOrderInput, changeOrderActionInput, purchasingLinkInput,
    subcontractorInput, subChangeOrderInput, subInvoiceInput,
} from "./domain.mjs";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createProjectDelivery({ db, get, replay, acknowledge, audit }) {
    const checkPhase = (projectId, phaseId) => {
        if (phaseId && !db.prepare("SELECT 1 FROM _project_phases WHERE id=? AND project_id=?").get(phaseId, projectId))
            fail("Phase does not belong to this project.", 404);
    };
    const checkJob = (projectId, jobId) => {
        if (jobId && !db.prepare("SELECT 1 FROM _project_jobs WHERE project_id=? AND job_id=?").get(projectId, jobId))
            fail("Job must be linked to this project first.", 409);
    };
    const checkTech = (technicianId) => {
        if (technicianId && !db.prepare("SELECT 1 FROM technicians WHERE id=?").get(technicianId))
            fail("Technician not found.", 404);
    };

    // PROJ-003: Field documentation (daily logs, forms, photos, signatures, completion evidence)
    const fieldDocs = (projectId) => db.prepare(
        `SELECT id,project_id AS projectId,phase_id AS phaseId,job_id AS jobId,doc_type AS docType,title,body,
                document_id AS documentId,billing_required AS billingRequired,status,signature_name AS signatureName,
                signature_intent AS signatureIntent,signed_at AS signedAt,author_id AS authorId,
                approved_by AS approvedBy,approved_at AS approvedAt,version,created_at AS createdAt,updated_at AS updatedAt
         FROM _project_field_docs WHERE project_id=? ORDER BY created_at DESC,id DESC`
    ).all(projectId).map((r) => ({ ...r, billingRequired: r.billingRequired === 1 }));

    function saveFieldDoc(user, projectId, raw) {
        writer(user);
        const d = parse(fieldDocInput, raw), fingerprint = hash({ action: "save_field_doc", projectId, ...d });
        if (d.docType === "signature" && (!d.signatureName || !d.signatureIntent))
            fail("Signature evidence requires signer name and explicit stated approval intent.");
        if (d.status === "approved") approver(user);
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            get(projectId);
            checkPhase(projectId, d.phaseId);
            checkJob(projectId, d.jobId);
            if (d.documentId) {
                try {
                    const doc = db.prepare("SELECT id FROM _document_records WHERE id=? AND archived=0").get(d.documentId);
                    if (!doc) fail("Referenced document not found.", 404);
                } catch (e) {
                    if (e?.status) throw e;
                }
            }
            const old = db.prepare("SELECT * FROM _project_field_docs WHERE id=?").get(d.id);
            if (old && old.project_id !== projectId) fail("Field document does not belong to this project.", 404);
            if (old && old.version !== d.expectedVersion) fail("Field document changed. Reload before saving.", 409);
            if (!old && d.expectedVersion !== 0) fail("Field document does not exist.", 409);
            const version = (old?.version ?? 0) + 1;
            const signedAt = d.docType === "signature" ? (old?.signed_at ?? new Date().toISOString()) : null;
            const approvedBy = d.status === "approved" ? (old?.approved_by ?? user.id) : null;
            const approvedAt = d.status === "approved" ? (old?.approved_at ?? new Date().toISOString()) : null;
            if (old) {
                db.prepare(
                    `UPDATE _project_field_docs SET phase_id=?,job_id=?,doc_type=?,title=?,body=?,document_id=?,
                     billing_required=?,status=?,signature_name=?,signature_intent=?,signed_at=?,approved_by=?,
                     approved_at=?,version=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?`
                ).run(d.phaseId, d.jobId, d.docType, d.title, d.body, d.documentId, Number(d.billingRequired), d.status, d.signatureName, d.signatureIntent, signedAt, approvedBy, approvedAt, version, d.id, d.expectedVersion);
            } else {
                db.prepare(
                    `INSERT INTO _project_field_docs(id,project_id,phase_id,job_id,doc_type,title,body,document_id,
                     billing_required,status,signature_name,signature_intent,signed_at,author_id,approved_by,approved_at,version)
                     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
                ).run(d.id, projectId, d.phaseId, d.jobId, d.docType, d.title, d.body, d.documentId, Number(d.billingRequired), d.status, d.signatureName, d.signatureIntent, signedAt, user.id, approvedBy, approvedAt, version);
            }
            const after = fieldDocs(projectId).find((f) => f.id === d.id);
            audit(projectId, user.id, old ? "update_field_doc" : "create_field_doc", "field_doc", d.id, old || {}, after, d.reason);
            const result = { fieldDoc: after };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    function billingReadiness(projectId) {
        const required = fieldDocs(projectId).filter((d) => d.billingRequired);
        const approved = required.filter((d) => d.status === "approved");
        const pending = required.filter((d) => d.status !== "approved");
        return { requiredCount: required.length, approvedCount: approved.length, pendingIds: pending.map((d) => d.id), ready: pending.length === 0 };
    }

    // PROJ-004: Crew management & field time
    const crews = (projectId) => {
        const rows = db.prepare(
            `SELECT c.id,c.project_id AS projectId,c.name,c.lead_technician_id AS leadTechnicianId,
                    t.name AS leadName,c.cost_code AS costCode,c.active,c.version,c.created_at AS createdAt
             FROM _project_crews c LEFT JOIN technicians t ON t.id=c.lead_technician_id
             WHERE c.project_id=? ORDER BY c.active DESC,c.name`
        ).all(projectId);
        const members = db.prepare(
            `SELECT m.id,m.crew_id AS crewId,m.technician_id AS technicianId,t.name AS technicianName,
                    m.role,m.effective_from AS effectiveFrom,m.effective_to AS effectiveTo,
                    m.hourly_cost_cents AS hourlyCostCents,m.hourly_bill_cents AS hourlyBillCents
             FROM _project_crew_members m JOIN technicians t ON t.id=m.technician_id
             WHERE m.project_id=? ORDER BY m.effective_from DESC,t.name`
        ).all(projectId);
        return rows.map((c) => ({ ...c, active: c.active === 1, members: members.filter((m) => m.crewId === c.id) }));
    };

    const crewTime = (projectId) => db.prepare(
        `SELECT ct.id,ct.project_id AS projectId,ct.crew_id AS crewId,ct.technician_id AS technicianId,
                t.name AS technicianName,ct.job_id AS jobId,ct.phase_id AS phaseId,ct.cost_code AS costCode,
                ct.work_date AS workDate,ct.hours_milli AS hoursMilli,ct.hourly_cost_cents AS hourlyCostCents,
                ct.status,ct.notes,ct.submitted_by AS submittedBy,ct.approved_by AS approvedBy,
                ct.approved_at AS approvedAt,ct.correction_of AS correctionOf,ct.version,ct.created_at AS createdAt
         FROM _project_crew_time ct JOIN technicians t ON t.id=ct.technician_id
         WHERE ct.project_id=? ORDER BY ct.work_date DESC,ct.created_at DESC`
    ).all(projectId).map((r) => ({ ...r, laborCostCents: Math.round((r.hoursMilli * r.hourlyCostCents) / 1000) }));

    function saveCrew(user, projectId, raw) {
        writer(user);
        const d = parse(crewInput, raw), fingerprint = hash({ action: "save_crew", projectId, ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            get(projectId);
            checkTech(d.leadTechnicianId);
            const old = db.prepare("SELECT * FROM _project_crews WHERE id=?").get(d.id);
            if (old && old.project_id !== projectId) fail("Crew does not belong to this project.", 404);
            if (old && old.version !== d.expectedVersion) fail("Crew changed. Reload before saving.", 409);
            if (!old && d.expectedVersion !== 0) fail("Crew does not exist.", 409);
            const version = (old?.version ?? 0) + 1;
            if (old) db.prepare("UPDATE _project_crews SET name=?,lead_technician_id=?,cost_code=?,active=?,version=? WHERE id=? AND version=?").run(d.name, d.leadTechnicianId, d.costCode, Number(d.active), version, d.id, d.expectedVersion);
            else db.prepare("INSERT INTO _project_crews(id,project_id,name,lead_technician_id,cost_code,active,version) VALUES(?,?,?,?,?,?,?)").run(d.id, projectId, d.name, d.leadTechnicianId, d.costCode, Number(d.active), version);
            const after = crews(projectId).find((c) => c.id === d.id);
            audit(projectId, user.id, old ? "update_crew" : "create_crew", "crew", d.id, old || {}, after, d.reason);
            const result = { crew: after };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    function addCrewMember(user, projectId, crewId, raw) {
        writer(user);
        const d = parse(crewMemberInput, raw), fingerprint = hash({ action: "add_crew_member", projectId, crewId, ...d });
        if (d.effectiveTo && d.effectiveTo < d.effectiveFrom) fail("Effective end date cannot precede start date.");
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            get(projectId);
            if (!db.prepare("SELECT 1 FROM _project_crews WHERE id=? AND project_id=?").get(crewId, projectId)) fail("Crew not found.", 404);
            checkTech(d.technicianId);
            db.prepare(
                `INSERT INTO _project_crew_members(id,crew_id,project_id,technician_id,role,effective_from,effective_to,hourly_cost_cents,hourly_bill_cents)
                 VALUES(?,?,?,?,?,?,?,?,?)
                 ON CONFLICT(id) DO UPDATE SET role=excluded.role,effective_from=excluded.effective_from,effective_to=excluded.effective_to,hourly_cost_cents=excluded.hourly_cost_cents,hourly_bill_cents=excluded.hourly_bill_cents`
            ).run(d.id, crewId, projectId, d.technicianId, d.role, d.effectiveFrom, d.effectiveTo, d.hourlyCostCents, d.hourlyBillCents);
            audit(projectId, user.id, "save_crew_member", "crew_member", d.id, {}, { crewId, ...d }, d.reason);
            const result = { crew: crews(projectId).find((c) => c.id === crewId) };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    function recordCrewTime(user, projectId, raw) {
        writer(user);
        const d = parse(crewTimeInput, raw), fingerprint = hash({ action: "record_crew_time", projectId, ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            get(projectId);
            checkTech(d.technicianId);
            checkPhase(projectId, d.phaseId);
            checkJob(projectId, d.jobId);
            if (d.crewId && !db.prepare("SELECT 1 FROM _project_crews WHERE id=? AND project_id=?").get(d.crewId, projectId)) fail("Crew not found.", 404);
            if (d.correctionOf && !db.prepare("SELECT 1 FROM _project_crew_time WHERE id=? AND project_id=?").get(d.correctionOf, projectId)) fail("Original time entry not found.", 404);
            db.prepare(
                `INSERT INTO _project_crew_time(id,project_id,crew_id,technician_id,job_id,phase_id,cost_code,work_date,hours_milli,hourly_cost_cents,status,notes,submitted_by,correction_of,version)
                 VALUES(?,?,?,?,?,?,?,?,?,?,'submitted',?,?,?,1)`
            ).run(d.id, projectId, d.crewId, d.technicianId, d.jobId, d.phaseId, d.costCode, d.workDate, d.hoursMilli, d.hourlyCostCents, d.notes, user.id, d.correctionOf);
            const entry = crewTime(projectId).find((t) => t.id === d.id);
            audit(projectId, user.id, d.correctionOf ? "correct_crew_time" : "record_crew_time", "crew_time", d.id, {}, entry, d.reason);
            const result = { timeEntry: entry };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    function reviewCrewTime(user, projectId, timeId, raw) {
        approver(user);
        parse(uuid, timeId);
        const d = parse(reviewDecisionInput, raw), fingerprint = hash({ action: "review_crew_time", projectId, timeId, ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            get(projectId);
            const old = db.prepare("SELECT * FROM _project_crew_time WHERE id=? AND project_id=?").get(timeId, projectId);
            if (!old) fail("Crew time entry not found.", 404);
            if (old.status !== "submitted") fail("Only submitted time entries can be reviewed.", 409);
            db.prepare("UPDATE _project_crew_time SET status=?,approved_by=?,approved_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?").run(d.decision, user.id, timeId);
            const after = crewTime(projectId).find((t) => t.id === timeId);
            audit(projectId, user.id, `crew_time_${d.decision}`, "crew_time", timeId, old, after, d.reason);
            const result = { timeEntry: after };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    // PROJ-005: Change orders
    const changeOrders = (projectId) => db.prepare(
        `SELECT id,project_id AS projectId,number,title,description,phase_id AS phaseId,cost_code AS costCode,
                labor_cost_cents AS laborCostCents,material_cost_cents AS materialCostCents,
                subcontract_cost_cents AS subcontractCostCents,price_cents AS priceCents,
                schedule_impact_days AS scheduleImpactDays,status,customer_accepted AS customerAccepted,
                customer_accepted_by AS customerAcceptedBy,customer_accepted_at AS customerAcceptedAt,
                submitted_by AS submittedBy,approved_by AS approvedBy,approved_at AS approvedAt,
                version,created_at AS createdAt,updated_at AS updatedAt
         FROM _project_change_orders WHERE project_id=? ORDER BY number ASC`
    ).all(projectId).map((r) => ({
        ...r,
        customerAccepted: r.customerAccepted === 1,
        estimatedCostCents: r.laborCostCents + r.materialCostCents + r.subcontractCostCents,
    }));

    function saveChangeOrder(user, projectId, raw) {
        writer(user);
        const d = parse(changeOrderInput, raw), fingerprint = hash({ action: "save_change_order", projectId, ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            get(projectId);
            checkPhase(projectId, d.phaseId);
            const old = db.prepare("SELECT * FROM _project_change_orders WHERE id=?").get(d.id);
            if (old && old.project_id !== projectId) fail("Change order does not belong to this project.", 404);
            if (old && old.status !== "draft") fail("Only draft change orders can be edited.", 409);
            if (old && old.version !== d.expectedVersion) fail("Change order changed. Reload before saving.", 409);
            if (!old && d.expectedVersion !== 0) fail("Change order does not exist.", 409);
            const version = (old?.version ?? 0) + 1;
            if (old) {
                db.prepare(
                    `UPDATE _project_change_orders SET title=?,description=?,phase_id=?,cost_code=?,labor_cost_cents=?,
                     material_cost_cents=?,subcontract_cost_cents=?,price_cents=?,schedule_impact_days=?,version=?,
                     updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?`
                ).run(d.title, d.description, d.phaseId, d.costCode, d.laborCostCents, d.materialCostCents, d.subcontractCostCents, d.priceCents, d.scheduleImpactDays, version, d.id, d.expectedVersion);
            } else {
                const nextNum = (db.prepare("SELECT COALESCE(MAX(number),0) AS n FROM _project_change_orders WHERE project_id=?").get(projectId).n || 0) + 1;
                db.prepare(
                    `INSERT INTO _project_change_orders(id,project_id,number,title,description,phase_id,cost_code,labor_cost_cents,material_cost_cents,subcontract_cost_cents,price_cents,schedule_impact_days,status,version)
                     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'draft',1)`
                ).run(d.id, projectId, nextNum, d.title, d.description, d.phaseId, d.costCode, d.laborCostCents, d.materialCostCents, d.subcontractCostCents, d.priceCents, d.scheduleImpactDays);
            }
            const after = changeOrders(projectId).find((c) => c.id === d.id);
            audit(projectId, user.id, old ? "update_change_order" : "create_change_order", "change_order", d.id, old || {}, after, d.reason);
            const result = { changeOrder: after };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    function transitionChangeOrder(user, projectId, coId, raw) {
        parse(uuid, coId);
        const d = parse(changeOrderActionInput, raw), fingerprint = hash({ action: "transition_co", projectId, coId, ...d });
        if (d.action === "submit") writer(user);
        else approver(user);
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            get(projectId);
            const old = db.prepare("SELECT * FROM _project_change_orders WHERE id=? AND project_id=?").get(coId, projectId);
            if (!old) fail("Change order not found.", 404);
            if (old.version !== d.expectedVersion) fail("Change order changed. Reload before reviewing.", 409);
            const version = old.version + 1;
            if (d.action === "submit") {
                if (old.status !== "draft") fail("Only draft change orders can be submitted.", 409);
                db.prepare("UPDATE _project_change_orders SET status='submitted',submitted_by=?,version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(user.id, version, coId);
            } else if (d.action === "approve") {
                if (old.status !== "submitted") fail("Submit the change order before approving.", 409);
                db.prepare("UPDATE _project_change_orders SET status='approved',approved_by=?,approved_at=CURRENT_TIMESTAMP,version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(user.id, version, coId);
            } else if (d.action === "reject") {
                if (!["draft", "submitted"].includes(old.status)) fail("Approved or already rejected change orders cannot be rejected.", 409);
                db.prepare("UPDATE _project_change_orders SET status='rejected',approved_by=?,approved_at=CURRENT_TIMESTAMP,version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(user.id, version, coId);
            } else if (d.action === "customer_accept") {
                if (old.status !== "approved") fail("Approve the change order internally before recording customer acceptance.", 409);
                if (old.customer_accepted === 1) fail("Customer acceptance is already recorded for this change order.", 409);
                if (!d.customerAcceptedBy) fail("Record who accepted the change order for the customer.");
                db.prepare("UPDATE _project_change_orders SET customer_accepted=1,customer_accepted_by=?,customer_accepted_at=CURRENT_TIMESTAMP,version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(d.customerAcceptedBy, version, coId);
            }
            const after = changeOrders(projectId).find((c) => c.id === coId);
            audit(projectId, user.id, `change_order_${d.action}`, "change_order", coId, old, after, d.reason);
            const result = { changeOrder: after };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    // PROJ-006: Purchasing & inventory commitments linked to project/phase/cost code
    const purchasingLinks = (projectId) => {
        const manual = db.prepare(
            `SELECT id,project_id AS projectId,phase_id AS phaseId,cost_code AS costCode,order_id AS orderId,
                    line_id AS lineId,description,committed_cents AS committedCents,received_cents AS receivedCents,
                    billed_cents AS billedCents,status,created_by AS createdBy,created_at AS createdAt
             FROM _project_purchasing_links WHERE project_id=? ORDER BY created_at DESC,id DESC`
        ).all(projectId);
        // Also project native PO lines attached to this project's linked jobs without double-counting
        let nativeOrders = [];
        try {
            nativeOrders = db.prepare(
                `SELECT l.id AS lineId,l.order_id AS orderId,o.number AS orderNumber,o.status AS orderStatus,
                        pj.phase_id AS phaseId,l.job_id AS jobId,l.description,
                        ROUND((l.quantity_milli*l.unit_cost_cents)/1000.0) AS committedCents,
                        COALESCE((SELECT ROUND(SUM(r.accepted_milli*r.unit_cost_cents)/1000.0) FROM _purch_receipts r WHERE r.line_id=l.id),0) AS receivedCents
                 FROM _purch_lines l
                 JOIN _purch_orders o ON o.id=l.order_id
                 JOIN _project_jobs pj ON pj.job_id=l.job_id
                 WHERE pj.project_id=? AND o.status<>'cancelled'
                 ORDER BY o.number,l.position`
            ).all(projectId).map((r) => ({ ...r, committedCents: Math.round(r.committedCents || 0), receivedCents: Math.round(r.receivedCents || 0) }));
        } catch {
            nativeOrders = [];
        }
        const linkedLineIds = new Set(manual.map((m) => m.lineId).filter(Boolean));
        const unlinkedNative = nativeOrders.filter((n) => !linkedLineIds.has(n.lineId));
        const activeManual = manual.filter((m) => m.status !== "cancelled");
        const committedCents = activeManual.reduce((s, r) => s + r.committedCents, 0) + unlinkedNative.reduce((s, r) => s + r.committedCents, 0);
        const receivedCents = activeManual.reduce((s, r) => s + r.receivedCents, 0) + unlinkedNative.reduce((s, r) => s + r.receivedCents, 0);
        const billedCents = activeManual.reduce((s, r) => s + r.billedCents, 0);
        // Open commitment = max(0, committed - max(received, billed)) so commitments are not double-counted when billed
        const openCommitmentCents = activeManual.reduce((s, r) => s + Math.max(0, r.committedCents - Math.max(r.receivedCents, r.billedCents)), 0)
            + unlinkedNative.reduce((s, r) => s + Math.max(0, r.committedCents - r.receivedCents), 0);
        return { links: manual, nativeOrders, summary: { committedCents, receivedCents, billedCents, openCommitmentCents } };
    };

    function savePurchasingLink(user, projectId, raw) {
        writer(user);
        const d = parse(purchasingLinkInput, raw), fingerprint = hash({ action: "save_purchasing_link", projectId, ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            get(projectId);
            checkPhase(projectId, d.phaseId);
            const old = db.prepare("SELECT * FROM _project_purchasing_links WHERE id=?").get(d.id);
            if (old && old.project_id !== projectId) fail("Purchasing link does not belong to this project.", 404);
            db.prepare(
                `INSERT INTO _project_purchasing_links(id,project_id,phase_id,cost_code,order_id,line_id,description,committed_cents,received_cents,billed_cents,status,created_by)
                 VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
                 ON CONFLICT(id) DO UPDATE SET phase_id=excluded.phase_id,cost_code=excluded.cost_code,order_id=excluded.order_id,line_id=excluded.line_id,
                 description=excluded.description,committed_cents=excluded.committed_cents,received_cents=excluded.received_cents,
                 billed_cents=excluded.billed_cents,status=excluded.status,updated_at=CURRENT_TIMESTAMP`
            ).run(d.id, projectId, d.phaseId, d.costCode, d.orderId, d.lineId, d.description, d.committedCents, d.receivedCents, d.billedCents, d.status, user.id);
            const after = purchasingLinks(projectId).links.find((l) => l.id === d.id);
            audit(projectId, user.id, old ? "update_purchasing_link" : "create_purchasing_link", "purchasing_link", d.id, old || {}, after, d.reason);
            const result = { link: after };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    // PROJ-007: Subcontractors, subcontractor change orders, and subcontractor invoices
    const subcontractors = (projectId) => {
        const subs = db.prepare(
            `SELECT id,project_id AS projectId,supplier_id AS supplierId,company_name AS companyName,
                    contact_name AS contactName,contact_email AS contactEmail,contact_phone AS contactPhone,
                    scope,phase_id AS phaseId,cost_code AS costCode,commitment_cents AS commitmentCents,
                    retainage_bps AS retainageBps,coi_expiry AS coiExpiry,license_expiry AS licenseExpiry,
                    w9_on_file AS w9OnFile,status,version,created_at AS createdAt
             FROM _project_subcontractors WHERE project_id=? ORDER BY company_name`
        ).all(projectId);
        const subCos = db.prepare(
            `SELECT id,subcontractor_id AS subcontractorId,number,title,amount_cents AS amountCents,
                    status,approved_by AS approvedBy,approved_at AS approvedAt,created_at AS createdAt
             FROM _project_sub_change_orders WHERE project_id=? ORDER BY number`
        ).all(projectId);
        const subInvs = db.prepare(
            `SELECT id,subcontractor_id AS subcontractorId,invoice_number AS invoiceNumber,period_end AS periodEnd,
                    gross_cents AS grossCents,retainage_cents AS retainageCents,net_cents AS netCents,
                    status,approved_by AS approvedBy,approved_at AS approvedAt,accounting_ref AS accountingRef,
                    created_at AS createdAt
             FROM _project_sub_invoices WHERE project_id=? ORDER BY created_at DESC`
        ).all(projectId);
        const today = new Date().toISOString().slice(0, 10);
        return subs.map((s) => {
            const cos = subCos.filter((c) => c.subcontractorId === s.id);
            const invs = subInvs.filter((i) => i.subcontractorId === s.id);
            const approvedChangesCents = cos.filter((c) => c.status === "approved").reduce((sum, c) => sum + c.amountCents, 0);
            const revisedCommitmentCents = s.commitmentCents + approvedChangesCents;
            const approvedInvoicedCents = invs.filter((i) => i.status === "approved").reduce((sum, i) => sum + i.grossCents, 0);
            const retainageHeldCents = invs.filter((i) => i.status === "approved").reduce((sum, i) => sum + i.retainageCents, 0);
            const complianceWarnings = [];
            if (!s.w9OnFile) complianceWarnings.push("Missing W-9");
            if (!s.coiExpiry || s.coiExpiry < today) complianceWarnings.push("COI missing or expired");
            if (s.licenseExpiry && s.licenseExpiry < today) complianceWarnings.push("License expired");
            return {
                ...s, w9OnFile: s.w9OnFile === 1,
                approvedChangesCents, revisedCommitmentCents, approvedInvoicedCents, retainageHeldCents,
                remainingCommitmentCents: Math.max(0, revisedCommitmentCents - approvedInvoicedCents),
                complianceWarnings, changeOrders: cos, invoices: invs,
            };
        });
    };

    function saveSubcontractor(user, projectId, raw) {
        writer(user);
        const d = parse(subcontractorInput, raw), fingerprint = hash({ action: "save_subcontractor", projectId, ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            get(projectId);
            checkPhase(projectId, d.phaseId);
            const old = db.prepare("SELECT * FROM _project_subcontractors WHERE id=?").get(d.id);
            if (old && old.project_id !== projectId) fail("Subcontractor does not belong to this project.", 404);
            if (old && old.version !== d.expectedVersion) fail("Subcontractor changed. Reload before saving.", 409);
            if (!old && d.expectedVersion !== 0) fail("Subcontractor does not exist.", 409);
            const version = (old?.version ?? 0) + 1;
            if (old) {
                db.prepare(
                    `UPDATE _project_subcontractors SET supplier_id=?,company_name=?,contact_name=?,contact_email=?,contact_phone=?,
                     scope=?,phase_id=?,cost_code=?,commitment_cents=?,retainage_bps=?,coi_expiry=?,license_expiry=?,w9_on_file=?,
                     status=?,version=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?`
                ).run(d.supplierId, d.companyName, d.contactName, d.contactEmail, d.contactPhone, d.scope, d.phaseId, d.costCode, d.commitmentCents, d.retainageBps, d.coiExpiry, d.licenseExpiry, Number(d.w9OnFile), d.status, version, d.id, d.expectedVersion);
            } else {
                db.prepare(
                    `INSERT INTO _project_subcontractors(id,project_id,supplier_id,company_name,contact_name,contact_email,contact_phone,scope,phase_id,cost_code,commitment_cents,retainage_bps,coi_expiry,license_expiry,w9_on_file,status,version)
                     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`
                ).run(d.id, projectId, d.supplierId, d.companyName, d.contactName, d.contactEmail, d.contactPhone, d.scope, d.phaseId, d.costCode, d.commitmentCents, d.retainageBps, d.coiExpiry, d.licenseExpiry, Number(d.w9OnFile), d.status);
            }
            const after = subcontractors(projectId).find((s) => s.id === d.id);
            audit(projectId, user.id, old ? "update_subcontractor" : "create_subcontractor", "subcontractor", d.id, old || {}, after, d.reason);
            const result = { subcontractor: after };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    function saveSubChangeOrder(user, projectId, subId, raw) {
        parse(uuid, subId);
        const d = parse(subChangeOrderInput, raw), fingerprint = hash({ action: "save_sub_co", projectId, subId, ...d });
        if (d.status === "approved") approver(user); else writer(user);
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            get(projectId);
            if (!db.prepare("SELECT 1 FROM _project_subcontractors WHERE id=? AND project_id=?").get(subId, projectId)) fail("Subcontractor not found.", 404);
            const nextNum = (db.prepare("SELECT COALESCE(MAX(number),0) AS n FROM _project_sub_change_orders WHERE subcontractor_id=?").get(subId).n || 0) + 1;
            const approvedBy = d.status === "approved" ? user.id : null;
            const approvedAt = d.status === "approved" ? new Date().toISOString() : null;
            db.prepare(
                `INSERT INTO _project_sub_change_orders(id,project_id,subcontractor_id,number,title,amount_cents,status,approved_by,approved_at)
                 VALUES(?,?,?,?,?,?,?,?,?)`
            ).run(d.id, projectId, subId, nextNum, d.title, d.amountCents, d.status, approvedBy, approvedAt);
            audit(projectId, user.id, "create_sub_change_order", "sub_change_order", d.id, {}, { subId, ...d }, d.reason);
            const result = { subcontractor: subcontractors(projectId).find((s) => s.id === subId) };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    function submitSubInvoice(user, projectId, subId, raw) {
        writer(user);
        parse(uuid, subId);
        const d = parse(subInvoiceInput, raw), fingerprint = hash({ action: "submit_sub_invoice", projectId, subId, ...d });
        if (d.retainageCents > d.grossCents) fail("Retainage cannot exceed gross invoice amount.");
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            get(projectId);
            const sub = db.prepare("SELECT * FROM _project_subcontractors WHERE id=? AND project_id=?").get(subId, projectId);
            if (!sub) fail("Subcontractor not found.", 404);
            if (db.prepare("SELECT 1 FROM _project_sub_invoices WHERE subcontractor_id=? AND invoice_number=?").get(subId, d.invoiceNumber))
                fail("That subcontractor invoice number already exists.", 409);
            const netCents = d.grossCents - d.retainageCents;
            db.prepare(
                `INSERT INTO _project_sub_invoices(id,project_id,subcontractor_id,invoice_number,period_end,gross_cents,retainage_cents,net_cents,status,accounting_ref)
                 VALUES(?,?,?,?,?,?,?,?,'submitted',?)`
            ).run(d.id, projectId, subId, d.invoiceNumber, d.periodEnd, d.grossCents, d.retainageCents, netCents, d.accountingRef);
            audit(projectId, user.id, "submit_sub_invoice", "sub_invoice", d.id, {}, { subId, ...d, netCents }, d.reason);
            const result = { subcontractor: subcontractors(projectId).find((s) => s.id === subId) };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    function reviewSubInvoice(user, projectId, invId, raw) {
        approver(user);
        parse(uuid, invId);
        const d = parse(reviewDecisionInput, raw), fingerprint = hash({ action: "review_sub_invoice", projectId, invId, ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            get(projectId);
            const old = db.prepare("SELECT * FROM _project_sub_invoices WHERE id=? AND project_id=?").get(invId, projectId);
            if (!old) fail("Subcontractor invoice not found.", 404);
            if (old.status !== "submitted") fail("Only submitted subcontractor invoices can be reviewed.", 409);
            db.prepare("UPDATE _project_sub_invoices SET status=?,approved_by=?,approved_at=CURRENT_TIMESTAMP WHERE id=?").run(d.decision, user.id, invId);
            audit(projectId, user.id, `sub_invoice_${d.decision}`, "sub_invoice", invId, old, { ...old, status: d.decision, approved_by: user.id }, d.reason);
            const result = { subcontractor: subcontractors(projectId).find((s) => s.id === old.subcontractor_id) };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    const auditLog = (user, projectId) => {
        reader(user);
        parse(uuid, projectId);
        get(projectId);
        return db.prepare(
            `SELECT id,project_id AS projectId,actor_id AS actorId,action,entity_type AS entityType,
                    entity_id AS entityId,before_json AS beforeJson,after_json AS afterJson,reason,created_at AS createdAt
             FROM _project_audit WHERE project_id=? ORDER BY id DESC LIMIT 200`
        ).all(projectId);
    };

    return {
        fieldDocs, saveFieldDoc, billingReadiness,
        crews, crewTime, saveCrew, addCrewMember, recordCrewTime, reviewCrewTime,
        changeOrders, saveChangeOrder, transitionChangeOrder,
        purchasingLinks, savePurchasingLink,
        subcontractors, saveSubcontractor, saveSubChangeOrder, submitSubInvoice, reviewSubInvoice,
        auditLog,
    };
}
