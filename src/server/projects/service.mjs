import { createHash, randomUUID } from "node:crypto";
import { migrate, transaction } from "../platform/sqlite.mjs";
import { projectSchema, projectSchemaV2, projectSchemaV3 } from "./schema.mjs";
import { parse, uuid, reader, writer, fail, projectInput, phaseInput, milestoneInput, linkJobInput, linkSiteInput, deliverableInput, fromProposalInput, baselineInput, issueInput, dependencyInput } from "./domain.mjs";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createProjects({ storage, proposalSource = null }) {
    const db = storage.database;
    migrate(db, "_project_migrations", [{ version: 1, sql: projectSchema }, { version: 2, sql: projectSchemaV2 }, { version: 3, sql: projectSchemaV3 }]);
    db.exec("CREATE TABLE IF NOT EXISTS _project_requests(request_key TEXT PRIMARY KEY,actor_id TEXT NOT NULL,request_hash TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");

    const customer = (id) => { const row = db.prepare("SELECT id,name FROM customers WHERE id=?").get(id); if (!row) fail("Customer not found.", 404); return row; };
    const projectRow = (id) => { const row = db.prepare("SELECT * FROM _projects WHERE id=?").get(id); return row ? { ...row, archived: row.archived === 1 } : null; };
    const get = (id) => { const p = projectRow(id); if (!p) fail("Project not found.", 404); return p; };
    const phases = (projectId) => db.prepare("SELECT id,project_id AS projectId,name,cost_code AS costCode,owner,planned_start AS plannedStart,planned_end AS plannedEnd,actual_start AS actualStart,actual_end AS actualEnd,position,percent_complete AS percentComplete,progress_updated_at AS progressUpdatedAt,version FROM _project_phases WHERE project_id=? ORDER BY position,name,id").all(projectId).map((r) => ({ ...r }));
    const milestones = (projectId) => db.prepare("SELECT id,project_id AS projectId,name,due_date AS dueDate,completed_at AS completedAt FROM _project_milestones WHERE project_id=? ORDER BY due_date,id").all(projectId).map((r) => ({ ...r, completed: r.completedAt !== null }));
    const jobs = (projectId) => db.prepare("SELECT j.id,j.phase_id AS phaseId,k.id AS jobId,k.identifier,k.status,k.scheduled_date AS scheduledDate FROM _project_jobs j JOIN jobs k ON k.id=j.job_id WHERE j.project_id=? ORDER BY k.identifier").all(projectId).map((r) => ({ ...r }));
    const sites = (projectId) => db.prepare("SELECT j.id,s.id AS siteId,s.name,s.address FROM _project_sites j JOIN sites s ON s.id=j.site_id WHERE j.project_id=? ORDER BY s.name").all(projectId).map((r) => ({ ...r }));
    const deliverables = (projectId) => db.prepare("SELECT id,project_id AS projectId,name,due_date AS dueDate,completed_at AS completedAt FROM _project_deliverables WHERE project_id=? ORDER BY due_date,id").all(projectId).map((r) => ({ ...r, completed: r.completedAt !== null }));
    const issues = (projectId) => db.prepare("SELECT id,project_id AS projectId,title,description,severity,status,assigned_to AS assignedTo,due_date AS dueDate,created_at AS createdAt,resolved_at AS resolvedAt FROM _project_issues WHERE project_id=? ORDER BY CASE status WHEN 'resolved' THEN 1 ELSE 0 END,severity DESC,created_at DESC,id DESC").all(projectId).map((r) => ({ ...r }));
    const dependencies = (projectId) => db.prepare("SELECT id,project_id AS projectId,phase_id AS phaseId,depends_on_id AS dependsOnId FROM _project_phase_dependencies WHERE project_id=? ORDER BY id").all(projectId).map((r) => ({ ...r }));
    const financials = (projectId) => {
        const row = db.prepare("SELECT COALESCE(SUM(i.total),0) AS actual FROM invoices i JOIN _project_jobs pj ON pj.job_id=i.job_id WHERE pj.project_id=?").get(projectId);
        return { actualCostCents: Math.round(row.actual * 100), committedCostCents: null, currency: "USD" };
    };
    const overdueActions = (projectId) => {
        const today = new Date().toISOString().slice(0, 10);
        return db.prepare("SELECT id,title,due_date AS dueDate,severity,status FROM _project_issues WHERE project_id=? AND status<>'resolved' AND due_date<>'' AND due_date<?").all(projectId, today).map((r) => ({ ...r }));
    };
    const replay = (user, key, fingerprint) => { const prior = db.prepare("SELECT actor_id,request_hash,result_json FROM _project_requests WHERE request_key=?").get(key); if (!prior) return null; if (prior.actor_id !== user.id) fail("This request belongs to another account.", 403); if (prior.request_hash !== fingerprint) fail("Request key has different project content.", 409); return JSON.parse(prior.result_json); };
    const acknowledge = (key, user, fingerprint, result) => db.prepare("INSERT INTO _project_requests(request_key,actor_id,request_hash,result_json) VALUES(?,?,?,?)").run(key, user.id, fingerprint, JSON.stringify(result));

    function save(user, raw) {
        writer(user);
        const d = parse(projectInput, raw), fingerprint = hash({ action: "save_project", ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            customer(d.customerId);
            const old = projectRow(d.id);
            if (old && old.version !== d.expectedVersion) fail("Project changed. Reload and review before saving.", 409);
            if (!old && d.expectedVersion !== 0) fail("Project does not exist.", 409);
            const version = (old?.version ?? 0) + 1;
            if (old) db.prepare("UPDATE _projects SET customer_id=?,title=?,description=?,status=?,project_manager=?,planned_start=?,planned_end=?,actual_start=?,actual_end=?,source_kind=?,source_id=?,archived=?,version=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?").run(d.customerId, d.title, d.description, d.status, d.projectManager, d.plannedStart, d.plannedEnd, d.actualStart, d.actualEnd, d.sourceKind, d.sourceId, Number(d.archived), version, user.id, d.id, d.expectedVersion);
            else db.prepare("INSERT INTO _projects(id,customer_id,title,description,status,project_manager,planned_start,planned_end,actual_start,actual_end,source_kind,source_id,archived,version,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(d.id, d.customerId, d.title, d.description, d.status, d.projectManager, d.plannedStart, d.plannedEnd, d.actualStart, d.actualEnd, d.sourceKind, d.sourceId, Number(d.archived), version, user.id);
            const result = { project: projectRow(d.id) };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    function list(user, query = {}) {
        reader(user);
        const page = Number(query.page || 1);
        if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) fail("Choose a valid project page.");
        const where = ["archived=0"], params = [];
        if (query.customerId) { where.push("customer_id=?"); params.push(query.customerId); }
        const base = "FROM _projects WHERE " + where.join(" AND ");
        return transaction(db, () => ({
            rows: db.prepare("SELECT * " + base + " ORDER BY updated_at DESC,id LIMIT 50 OFFSET ?").all(...params, (page - 1) * 50).map((r) => ({ ...r, archived: r.archived === 1 })),
            total: db.prepare("SELECT COUNT(*) AS n " + base).get(...params).n,
            page,
            pageSize: 50,
        }));
    }

    // A project may originate from an accepted Sales proposal; surface the opportunity.
    const source = (project) => {
        if (!project?.source_kind || !project?.source_id) return null;
        if (project.source_kind !== "quote") return { kind: project.source_kind, id: project.source_id };
        try {
            const row = db.prepare("SELECT q.id AS quoteId,o.id AS opportunityId,o.title,o.expected_value AS value,o.probability,o.expected_close_date AS closeDate,p.name AS pipeline,s.name AS stage,s.kind AS stageKind FROM _sales_quotes q JOIN _sales_opportunities o ON o.id=q.opportunity_id JOIN _sales_pipelines p ON p.id=o.pipeline_id JOIN _sales_stages s ON s.id=o.stage_id WHERE q.id=?").get(project.source_id);
            return row ? { kind: "opportunity", ...row } : { kind: "quote", id: project.source_id };
        } catch {
            return { kind: "quote", id: project.source_id };
        }
    };

    function detail(user, id) {
        reader(user);
        parse(uuid, id);
        return transaction(db, () => ({ project: get(id), phases: phases(id), milestones: milestones(id), jobs: jobs(id), sites: sites(id), deliverables: deliverables(id), issues: issues(id), dependencies: dependencies(id), financials: financials(id), overdueActions: overdueActions(id), source: source(get(id)) }));
    }

    function savePhase(user, projectId, raw) {
        writer(user);
        const d = parse(phaseInput, raw), fingerprint = hash({ action: "save_phase", projectId, ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            get(projectId);
            const old = db.prepare("SELECT * FROM _project_phases WHERE id=?").get(d.id);
            if (old && old.project_id !== projectId) fail("Phase does not belong to this project.", 404);
            if (old && old.version !== d.expectedVersion) fail("Phase changed. Reload and review before saving.", 409);
            const version = (old?.version ?? 0) + 1;
            if (old) db.prepare("UPDATE _project_phases SET name=?,cost_code=?,owner=?,planned_start=?,planned_end=?,actual_start=?,actual_end=?,position=?,percent_complete=?,progress_updated_at=CURRENT_TIMESTAMP,version=? WHERE id=? AND version=?").run(d.name, d.costCode, d.owner, d.plannedStart, d.plannedEnd, d.actualStart, d.actualEnd, d.position, d.percentComplete, version, d.id, d.expectedVersion);
            else db.prepare("INSERT INTO _project_phases(id,project_id,name,cost_code,owner,planned_start,planned_end,actual_start,actual_end,position,percent_complete,progress_updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(d.id, projectId, d.name, d.costCode, d.owner, d.plannedStart, d.plannedEnd, d.actualStart, d.actualEnd, d.position, d.percentComplete, d.percentComplete > 0 ? new Date().toISOString() : null, version);
            const result = { phase: db.prepare("SELECT id,name,cost_code AS costCode,owner,position,version FROM _project_phases WHERE id=?").get(d.id) };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    function saveMilestone(user, projectId, raw) {
        writer(user);
        const d = parse(milestoneInput, raw), fingerprint = hash({ action: "save_milestone", projectId, ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            get(projectId);
            const old = db.prepare("SELECT * FROM _project_milestones WHERE id=?").get(d.id);
            if (old && old.project_id !== projectId) fail("Milestone does not belong to this project.", 404);
            const completedAt = d.completed ? (old?.completed_at ?? new Date().toISOString()) : null;
            db.prepare("INSERT INTO _project_milestones(id,project_id,name,due_date,completed_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,due_date=excluded.due_date,completed_at=excluded.completed_at").run(d.id, projectId, d.name, d.dueDate, completedAt);
            const result = { milestone: db.prepare("SELECT id,name,due_date AS dueDate,completed_at AS completedAt FROM _project_milestones WHERE id=?").get(d.id) };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    function linkJob(user, projectId, raw) {
        writer(user);
        const d = parse(linkJobInput, raw), fingerprint = hash({ action: "link_job", projectId, ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            const project = get(projectId);
            const job = db.prepare("SELECT id,customer_id FROM jobs WHERE id=?").get(d.jobId);
            if (!job) fail("Job not found.", 404);
            if (job.customer_id !== project.customer_id) fail("Link only jobs belonging to this project's customer.", 409);
            if (d.phaseId && !db.prepare("SELECT 1 FROM _project_phases WHERE id=? AND project_id=?").get(d.phaseId, projectId)) fail("Phase does not belong to this project.", 404);
            if (db.prepare("SELECT 1 FROM _project_jobs WHERE job_id=?").get(d.jobId)) fail("That job is already linked to a project.", 409);
            db.prepare("INSERT INTO _project_jobs(id,project_id,job_id,phase_id) VALUES(?,?,?,?)").run(d.id, projectId, d.jobId, d.phaseId);
            const result = { link: { id: d.id, projectId, jobId: d.jobId, phaseId: d.phaseId } };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    function unlinkJob(user, projectId, linkId) {
        writer(user);
        return transaction(db, () => {
            get(projectId);
            const link = db.prepare("SELECT * FROM _project_jobs WHERE id=? AND project_id=?").get(linkId, projectId);
            if (!link) fail("Job link not found.", 404);
            db.prepare("DELETE FROM _project_jobs WHERE id=?").run(linkId);
            return { unlinked: true };
        });
    }

    function linkSite(user, projectId, raw) {
        writer(user);
        const d = parse(linkSiteInput, raw), fingerprint = hash({ action: "link_site", projectId, ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            const project = get(projectId);
            const site = db.prepare("SELECT id,customer_id FROM sites WHERE id=?").get(d.siteId);
            if (!site) fail("Location not found.", 404);
            if (site.customer_id !== project.customer_id) fail("Link only locations belonging to this project's customer.", 409);
            if (db.prepare("SELECT 1 FROM _project_sites WHERE project_id=? AND site_id=?").get(projectId, d.siteId)) fail("That location is already linked to this project.", 409);
            db.prepare("INSERT INTO _project_sites(id,project_id,site_id) VALUES(?,?,?)").run(d.id, projectId, d.siteId);
            const result = { link: { id: d.id, projectId, siteId: d.siteId } };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    function unlinkSite(user, projectId, linkId) {
        writer(user);
        return transaction(db, () => {
            get(projectId);
            const link = db.prepare("SELECT * FROM _project_sites WHERE id=? AND project_id=?").get(linkId, projectId);
            if (!link) fail("Location link not found.", 404);
            db.prepare("DELETE FROM _project_sites WHERE id=?").run(linkId);
            return { unlinked: true };
        });
    }

    function saveDeliverable(user, projectId, raw) {
        writer(user);
        const d = parse(deliverableInput, raw), fingerprint = hash({ action: "save_deliverable", projectId, ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            get(projectId);
            const old = db.prepare("SELECT * FROM _project_deliverables WHERE id=?").get(d.id);
            if (old && old.project_id !== projectId) fail("Deliverable does not belong to this project.", 404);
            const completedAt = d.completed ? (old?.completed_at ?? new Date().toISOString()) : null;
            db.prepare("INSERT INTO _project_deliverables(id,project_id,name,due_date,completed_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,due_date=excluded.due_date,completed_at=excluded.completed_at").run(d.id, projectId, d.name, d.dueDate, completedAt);
            const result = { deliverable: db.prepare("SELECT id,name,due_date AS dueDate,completed_at AS completedAt FROM _project_deliverables WHERE id=?").get(d.id) };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    function fromProposal(user, raw) {
        writer(user);
        const d = parse(fromProposalInput, raw), fingerprint = hash({ action: "from_proposal", ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            if (!proposalSource) fail("Accepted-proposal conversion is not configured here.", 501);
            const proposal = proposalSource(user, d.quoteId);
            if (!proposal || !proposal.customerId) fail("Choose an accepted proposal to convert.", 404);
            if (db.prepare("SELECT 1 FROM _projects WHERE source_kind='quote' AND source_id=?").get(d.quoteId)) fail("That proposal is already converted to a project.", 409);
            customer(proposal.customerId);
            db.prepare("INSERT INTO _projects(id,customer_id,title,description,status,project_manager,planned_start,planned_end,actual_start,actual_end,source_kind,source_id,archived,version,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(d.projectId, proposal.customerId, proposal.title, proposal.scope || "", "active", "", "", "", "", "", "quote", d.quoteId, 0, 1, user.id);
            const result = { project: projectRow(d.projectId) };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    function setBaseline(user, projectId, raw) {
        writer(user);
        const d = parse(baselineInput, raw), fingerprint = hash({ action: "set_baseline", projectId, ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            const project = get(projectId);
            db.prepare("UPDATE _projects SET baseline_cost_cents=?,baseline_start=?,baseline_end=?,estimate_to_complete_cents=?,baselined_at=CURRENT_TIMESTAMP,baselined_by=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(d.baselineCostCents, d.baselineStart, d.baselineEnd, d.estimateToCompleteCents, user.id, projectId);
            const result = { project: projectRow(projectId), baseline: { costCents: d.baselineCostCents, start: d.baselineStart, end: d.baselineEnd, estimateToCompleteCents: d.estimateToCompleteCents, version: project.version + 1 } };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    function saveIssue(user, projectId, raw) {
        writer(user);
        const d = parse(issueInput, raw), fingerprint = hash({ action: "save_issue", projectId, ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            get(projectId);
            const old = db.prepare("SELECT * FROM _project_issues WHERE id=?").get(d.id);
            if (old && old.project_id !== projectId) fail("Issue does not belong to this project.", 404);
            const resolvedAt = d.status === "resolved" ? (old?.resolved_at ?? new Date().toISOString()) : null;
            db.prepare("INSERT INTO _project_issues(id,project_id,title,description,severity,status,assigned_to,due_date,resolved_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,severity=excluded.severity,status=excluded.status,assigned_to=excluded.assigned_to,due_date=excluded.due_date,resolved_at=excluded.resolved_at").run(d.id, projectId, d.title, d.description, d.severity, d.status, d.assignedTo, d.dueDate, resolvedAt);
            const result = { issue: db.prepare("SELECT id,title,severity,status,assigned_to AS assignedTo,due_date AS dueDate,resolved_at AS resolvedAt FROM _project_issues WHERE id=?").get(d.id) };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    function saveDependency(user, projectId, raw) {
        writer(user);
        const d = parse(dependencyInput, raw), fingerprint = hash({ action: "save_dependency", projectId, ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            get(projectId);
            if (d.phaseId === d.dependsOnId) fail("A phase cannot depend on itself.", 409);
            const phase = db.prepare("SELECT 1 FROM _project_phases WHERE id=? AND project_id=?").get(d.phaseId, projectId);
            const dep = db.prepare("SELECT 1 FROM _project_phases WHERE id=? AND project_id=?").get(d.dependsOnId, projectId);
            if (!phase || !dep) fail("Both phases must belong to this project.", 404);
            if (db.prepare("SELECT 1 FROM _project_phase_dependencies WHERE phase_id=? AND depends_on_id=?").get(d.phaseId, d.dependsOnId)) fail("That dependency already exists.", 409);
            db.prepare("INSERT INTO _project_phase_dependencies(id,project_id,phase_id,depends_on_id) VALUES(?,?,?,?)").run(d.id, projectId, d.phaseId, d.dependsOnId);
            const result = { dependency: { id: d.id, projectId, phaseId: d.phaseId, dependsOnId: d.dependsOnId } };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    return { save, list, detail, savePhase, saveMilestone, linkJob, unlinkJob, linkSite, unlinkSite, saveDeliverable, fromProposal, setBaseline, saveIssue, saveDependency };
}
