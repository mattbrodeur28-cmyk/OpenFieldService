import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { migrate, transaction } from "../platform/sqlite.mjs";
import { businessSchema } from "./schema.mjs";

export class BusinessError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = (msg, status = 400) => { throw new BusinessError(msg, status); };
const parse = (schema, raw) => {
    const r = schema.safeParse(raw);
    if (!r.success) fail(r.error.issues.map((i) => i.message).join("; "));
    return r.data;
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function requireOwnerOrAdmin(user) {
    if (!user?.active || user.mustChangePassword) fail("Sign in to continue.", 401);
    if (!["owner", "admin"].includes(user.role)) fail("Owner or Admin access is required for Business Owner controls.", 403);
}

const reportInput = z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(160),
    dataset: z.enum(["invoices", "jobs", "opportunities", "inventory", "labor", "projects", "residential"]),
    filters: z.record(z.unknown()).default({}),
    schedule: z.enum(["manual", "daily", "weekly", "monthly"]).default("manual"),
}).strict();

const automationInput = z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(160),
    triggerKind: z.enum(["invoice_overdue", "agreement_renewal_due", "inventory_low_stock", "job_unassigned", "booking_urgent"]),
    actionKind: z.enum(["create_task", "notify_owner", "flag_review"]),
    config: z.record(z.unknown()).default({}),
    requiresApproval: z.boolean().default(true),
    enabled: z.boolean().default(false),
}).strict();

const portalTokenInput = z.object({
    customerId: z.string().uuid(),
    label: z.string().trim().min(1).max(120),
    expiresInDays: z.number().int().min(1).max(365).default(30),
    scopes: z.array(z.enum(["quotes", "agreements", "reports", "invoices"])).min(1).default(["quotes", "agreements", "reports", "invoices"]),
}).strict();

export function createBusinessService({ storage }) {
    const db = storage.database;
    migrate(db, "_business_migrations", [{ version: 1, sql: businessSchema }]);

    const hasTable = (name) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
    const today = () => new Date().toISOString().slice(0, 10);

    // BIZ-001..004: Live cross-module executive dashboard
    function dashboard(user) {
        requireOwnerOrAdmin(user);
        const nowDate = today();
        const computedAt = new Date().toISOString();

        // Dispatch & Jobs
        const unassignedJobs = db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE technician_id IS NULL AND status NOT IN ('completed','cancelled')").get().n;
        const overdueJobs = db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE scheduled_date<>'' AND scheduled_date<? AND status NOT IN ('completed','cancelled')").get(nowDate).n;
        const activeJobs = db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('pending','confirmed','in_progress')").get().n;

        // Financials & Invoices (BIZ-002)
        const invAgg = db.prepare(
            `SELECT COUNT(*) AS totalCount,
                    SUM(CASE WHEN status IN ('sent','overdue') THEN 1 ELSE 0 END) AS outstandingCount,
                    COALESCE(SUM(CASE WHEN status IN ('sent','overdue') THEN total ELSE 0 END),0) AS outstandingDollars,
                    COALESCE(SUM(CASE WHEN status='paid' THEN total ELSE 0 END),0) AS paidDollars,
                    COALESCE(SUM(CASE WHEN status='overdue' OR (status='sent' AND due_date<>'' AND due_date<?) THEN total ELSE 0 END),0) AS overdueDollars
             FROM invoices`
        ).get(nowDate);

        // Sales pipeline (M4)
        let pipeline = { openCount: 0, openValueCents: 0, pendingQuoteReviews: 0 };
        if (hasTable("_sales_opportunities") && hasTable("_sales_stages")) {
            const pRow = db.prepare(
                `SELECT COUNT(*) AS n, COALESCE(SUM(o.expected_value),0) AS val
                 FROM _sales_opportunities o JOIN _sales_stages s ON s.id=o.stage_id WHERE s.kind='open'`
            ).get();
            pipeline.openCount = pRow.n;
            pipeline.openValueCents = Math.round((pRow.val || 0) * 100);
        }
        if (hasTable("_sales_quotes")) {
            pipeline.pendingQuoteReviews = db.prepare("SELECT COUNT(*) AS n FROM _sales_quotes WHERE status='draft'").get().n;
        }

        // Agreements & Renewals (M5)
        let agreements = { total: 0, renewingWithin60Days: 0 };
        if (hasTable("_agreement_drafts")) {
            agreements.total = db.prepare("SELECT COUNT(*) AS n FROM _agreement_drafts WHERE archived=0").get().n;
        }
        if (hasTable("_agreement_authorizations")) {
            const plus60 = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
            agreements.renewingWithin60Days = db.prepare(
                "SELECT COUNT(*) AS n FROM _agreement_authorizations WHERE cancelled_at IS NULL AND ends_on>=? AND ends_on<=?"
            ).get(nowDate, plus60).n;
        }

        // Labor (BIZ-003)
        let labor = { approvedServiceMinutes: 0, approvedProjectHours: 0, approvedProjectLaborCents: 0, pendingTimeApprovals: 0 };
        if (hasTable("_service_time_entries")) {
            labor.approvedServiceMinutes = db.prepare("SELECT COALESCE(SUM(worked_minutes),0) AS m FROM _service_time_entries WHERE state='approved'").get().m;
            labor.pendingTimeApprovals += db.prepare("SELECT COUNT(*) AS n FROM _service_time_entries WHERE state='submitted'").get().n;
        }
        if (hasTable("_project_crew_time")) {
            const ct = db.prepare(
                "SELECT COALESCE(SUM(hours_milli),0) AS hm, COALESCE(SUM(ROUND(hours_milli*hourly_cost_cents/1000.0)),0) AS cost FROM _project_crew_time WHERE status='approved'"
            ).get();
            labor.approvedProjectHours = Math.round((ct.hm || 0) / 10) / 100;
            labor.approvedProjectLaborCents = Math.round(ct.cost || 0);
            labor.pendingTimeApprovals += db.prepare("SELECT COUNT(*) AS n FROM _project_crew_time WHERE status='submitted'").get().n;
        }

        // Inventory & Purchasing (BIZ-004)
        let inventory = { lowStockCount: 0, openPoCount: 0, openPoCommitmentCents: 0 };
        if (hasTable("_inventory_balances")) {
            inventory.lowStockCount = db.prepare("SELECT COUNT(*) AS n FROM _inventory_balances WHERE reorder_milli>0 AND quantity_milli<=reorder_milli").get().n;
        }
        if (hasTable("_purch_orders") && hasTable("_purch_lines")) {
            inventory.openPoCount = db.prepare("SELECT COUNT(*) AS n FROM _purch_orders WHERE status IN ('approved','issued','partially_received')").get().n;
            const poVal = db.prepare(
                `SELECT COALESCE(SUM(ROUND(l.quantity_milli*l.unit_cost_cents/1000.0)),0) AS c
                 FROM _purch_lines l JOIN _purch_orders o ON o.id=l.order_id
                 WHERE o.status IN ('approved','issued','partially_received')`
            ).get();
            inventory.openPoCommitmentCents = Math.round(poVal.c || 0);
        }

        // Projects (M11)
        let projects = { activeCount: 0, contractValueCents: 0, pendingBillingApps: 0 };
        if (hasTable("_projects")) {
            const pr = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(contract_value_cents),0) AS c FROM _projects WHERE archived=0 AND status='active'").get();
            projects.activeCount = pr.n;
            projects.contractValueCents = pr.c;
        }
        if (hasTable("_project_billing_apps")) {
            projects.pendingBillingApps = db.prepare("SELECT COUNT(*) AS n FROM _project_billing_apps WHERE status IN ('draft','in_review','submitted')").get().n;
        }

        // Residential (M12)
        let residential = { activeMemberships: 0, openBookings: 0, pendingEstimates: 0 };
        if (hasTable("_res_memberships")) {
            residential.activeMemberships = db.prepare("SELECT COUNT(*) AS n FROM _res_memberships WHERE status='active'").get().n;
        }
        if (hasTable("_res_bookings")) {
            residential.openBookings = db.prepare("SELECT COUNT(*) AS n FROM _res_bookings WHERE status IN ('new','escalated')").get().n;
        }
        if (hasTable("_res_estimates")) {
            residential.pendingEstimates = db.prepare("SELECT COUNT(*) AS n FROM _res_estimates WHERE status='presented'").get().n;
        }

        return {
            computedAt,
            note: "Live operational metrics derived from native records; operational totals are distinct from posted QuickBooks accounting ledgers.",
            dispatch: { activeJobs, unassignedJobs, overdueJobs },
            financials: {
                outstandingInvoices: invAgg.outstandingCount || 0,
                outstandingCents: Math.round((invAgg.outstandingDollars || 0) * 100),
                overdueCents: Math.round((invAgg.overdueDollars || 0) * 100),
                paidOperationalCents: Math.round((invAgg.paidDollars || 0) * 100),
                currency: "USD",
            },
            pipeline,
            agreements,
            labor,
            inventory,
            projects,
            residential,
        };
    }

    // BIZ-005: Saved reports & CSV/JSON export
    function listReports(user) {
        requireOwnerOrAdmin(user);
        return db.prepare("SELECT id,name,dataset,filters_json AS filtersJson,schedule,created_by AS createdBy,created_at AS createdAt FROM _biz_saved_reports ORDER BY updated_at DESC").all()
            .map((r) => ({ ...r, filters: JSON.parse(r.filtersJson || "{}") }));
    }

    function saveReport(user, raw) {
        requireOwnerOrAdmin(user);
        const d = parse(reportInput, raw);
        const id = d.id || randomUUID();
        return transaction(db, () => {
            db.prepare(
                `INSERT INTO _biz_saved_reports(id,name,dataset,filters_json,schedule,created_by)
                 VALUES(?,?,?,?,?,?)
                 ON CONFLICT(id) DO UPDATE SET name=excluded.name,dataset=excluded.dataset,filters_json=excluded.filters_json,schedule=excluded.schedule,updated_at=CURRENT_TIMESTAMP`
            ).run(id, d.name, d.dataset, JSON.stringify(d.filters), d.schedule, user.id);
            return { report: listReports(user).find((r) => r.id === id) };
        });
    }

    function runDataset(dataset) {
        if (dataset === "invoices") return db.prepare("SELECT id,identifier,customer_id AS customerId,status,total,due_date AS dueDate,created_at AS createdAt FROM invoices ORDER BY created_at DESC LIMIT 500").all();
        if (dataset === "jobs") return db.prepare("SELECT id,identifier,customer_id AS customerId,technician_id AS technicianId,status,priority,scheduled_date AS scheduledDate,price FROM jobs ORDER BY scheduled_date DESC LIMIT 500").all();
        if (dataset === "opportunities" && hasTable("_sales_opportunities")) return db.prepare("SELECT id,title,segment,expected_value AS expectedValue,probability,expected_close_date AS expectedCloseDate FROM _sales_opportunities ORDER BY updated_at DESC LIMIT 500").all();
        if (dataset === "inventory") return db.prepare("SELECT id,name,unit,unit_cost AS unitCost,in_stock AS inStock FROM materials ORDER BY name LIMIT 500").all();
        if (dataset === "projects" && hasTable("_projects")) return db.prepare("SELECT id,title,track,status,contract_value_cents AS contractValueCents,planned_start AS plannedStart,planned_end AS plannedEnd FROM _projects WHERE archived=0 ORDER BY updated_at DESC LIMIT 500").all();
        if (dataset === "labor" && hasTable("_service_time_entries")) return db.prepare("SELECT id,job_id AS jobId,technician_id AS technicianId,worked_minutes AS workedMinutes,work_type AS workType,state,start_at AS startAt FROM _service_time_entries ORDER BY start_at DESC LIMIT 500").all();
        if (dataset === "residential" && hasTable("_res_memberships")) return db.prepare("SELECT id,customer_id AS customerId,plan_name AS planName,status,renewal_date AS renewalDate,price_cents AS priceCents FROM _res_memberships ORDER BY created_at DESC LIMIT 500").all();
        return [];
    }

    function exportReport(user, reportId, format = "json") {
        requireOwnerOrAdmin(user);
        const rep = db.prepare("SELECT * FROM _biz_saved_reports WHERE id=?").get(reportId);
        if (!rep) fail("Saved report not found.", 404);
        const rows = runDataset(rep.dataset);
        const generatedAt = new Date().toISOString();
        if (format === "csv") {
            const headers = rows.length ? Object.keys(rows[0]) : ["empty"];
            const escCsv = (v) => {
                const s = v == null ? "" : String(v);
                return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            };
            const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escCsv(r[h])).join(","))].join("\n");
            return { format: "csv", filename: `${rep.dataset}-report.csv`, body: csv, generatedAt, rowCount: rows.length };
        }
        return { format: "json", report: { id: rep.id, name: rep.name, dataset: rep.dataset, schedule: rep.schedule }, generatedAt, rowCount: rows.length, rows };
    }

    // BIZ-006: Explicit Automations with Dry-Run Preview & Audit
    function listAutomations(user) {
        requireOwnerOrAdmin(user);
        const rules = db.prepare("SELECT id,name,trigger_kind AS triggerKind,action_kind AS actionKind,config_json AS configJson,requires_approval AS requiresApproval,enabled,created_by AS createdBy,created_at AS createdAt FROM _biz_automations ORDER BY created_at DESC").all();
        const runs = db.prepare("SELECT id,automation_id AS automationId,mode,matched_count AS matchedCount,summary_json AS summaryJson,actor_id AS actorId,created_at AS createdAt FROM _biz_automation_runs ORDER BY created_at DESC LIMIT 100").all();
        return rules.map((r) => ({
            ...r,
            config: JSON.parse(r.configJson || "{}"),
            requiresApproval: r.requiresApproval === 1,
            enabled: r.enabled === 1,
            recentRuns: runs.filter((x) => x.automationId === r.id).slice(0, 5),
        }));
    }

    function saveAutomation(user, raw) {
        requireOwnerOrAdmin(user);
        const d = parse(automationInput, raw);
        const id = d.id || randomUUID();
        return transaction(db, () => {
            db.prepare(
                `INSERT INTO _biz_automations(id,name,trigger_kind,action_kind,config_json,requires_approval,enabled,created_by)
                 VALUES(?,?,?,?,?,?,?,?)
                 ON CONFLICT(id) DO UPDATE SET name=excluded.name,trigger_kind=excluded.trigger_kind,action_kind=excluded.action_kind,
                 config_json=excluded.config_json,requires_approval=excluded.requires_approval,enabled=excluded.enabled,updated_at=CURRENT_TIMESTAMP`
            ).run(id, d.name, d.triggerKind, d.actionKind, JSON.stringify(d.config), Number(d.requiresApproval), Number(d.enabled), user.id);
            return { automation: listAutomations(user).find((a) => a.id === id) };
        });
    }

    function dryRunAutomation(user, id) {
        requireOwnerOrAdmin(user);
        const rule = db.prepare("SELECT * FROM _biz_automations WHERE id=?").get(id);
        if (!rule) fail("Automation rule not found.", 404);
        const nowDate = today();
        let matches = [];
        if (rule.trigger_kind === "invoice_overdue") {
            matches = db.prepare("SELECT id,identifier,total,due_date AS dueDate FROM invoices WHERE status='overdue' OR (status='sent' AND due_date<>'' AND due_date<?) LIMIT 50").all(nowDate);
        } else if (rule.trigger_kind === "job_unassigned") {
            matches = db.prepare("SELECT id,identifier,scheduled_date AS scheduledDate,priority FROM jobs WHERE technician_id IS NULL AND status NOT IN ('completed','cancelled') LIMIT 50").all();
        } else if (rule.trigger_kind === "inventory_low_stock" && hasTable("_inventory_balances")) {
            matches = db.prepare("SELECT b.location_id AS locationId,b.material_id AS materialId,m.name,b.quantity_milli AS quantityMilli,b.reorder_milli AS reorderMilli FROM _inventory_balances b JOIN materials m ON m.id=b.material_id WHERE b.reorder_milli>0 AND b.quantity_milli<=b.reorder_milli LIMIT 50").all();
        } else if (rule.trigger_kind === "agreement_renewal_due" && hasTable("_agreement_authorizations")) {
            const plus60 = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
            matches = db.prepare("SELECT agreement_id AS agreementId,ends_on AS endsOn FROM _agreement_authorizations WHERE cancelled_at IS NULL AND ends_on>=? AND ends_on<=? LIMIT 50").all(nowDate, plus60);
        } else if (rule.trigger_kind === "booking_urgent" && hasTable("_res_bookings")) {
            matches = db.prepare("SELECT id,customer_id AS customerId,issue,urgency,preferred_date AS preferredDate FROM _res_bookings WHERE status IN ('new','escalated') AND urgency IN ('urgent','emergency') LIMIT 50").all();
        }
        const runId = randomUUID();
        const summary = { triggerKind: rule.trigger_kind, actionKind: rule.action_kind, sampleIds: matches.slice(0, 10) };
        db.prepare("INSERT INTO _biz_automation_runs(id,automation_id,mode,matched_count,summary_json,actor_id) VALUES(?,?,'dry_run',?,?,?)")
            .run(runId, id, matches.length, JSON.stringify(summary), user.id);
        return { runId, mode: "dry_run", matchedCount: matches.length, matches, note: "Dry-run preview only; no records were modified." };
    }

    // BIZ-007: External Customer Portal (separate customer-scoped bearer token identity)
    function listPortalTokens(user, customerId = null) {
        requireOwnerOrAdmin(user);
        const rows = customerId
            ? db.prepare("SELECT id,customer_id AS customerId,label,scopes_json AS scopesJson,expires_at AS expiresAt,revoked_at AS revokedAt,created_by AS createdBy,created_at AS createdAt FROM _portal_tokens WHERE customer_id=? ORDER BY created_at DESC").all(customerId)
            : db.prepare("SELECT t.id,t.customer_id AS customerId,c.name AS customerName,t.label,t.scopes_json AS scopesJson,t.expires_at AS expiresAt,t.revoked_at AS revokedAt,t.created_by AS createdBy,t.created_at AS createdAt FROM _portal_tokens t JOIN customers c ON c.id=t.customer_id ORDER BY t.created_at DESC LIMIT 100").all();
        return rows.map((r) => ({ ...r, scopes: JSON.parse(r.scopesJson || "[]"), active: !r.revokedAt && r.expiresAt > new Date().toISOString() }));
    }

    function issuePortalToken(user, raw) {
        requireOwnerOrAdmin(user);
        const d = parse(portalTokenInput, raw);
        const cust = db.prepare("SELECT id,name FROM customers WHERE id=?").get(d.customerId);
        if (!cust) fail("Customer not found.", 404);
        const rawToken = "ofsp_" + randomBytes(24).toString("hex");
        const tokenHash = sha256(rawToken);
        const id = randomUUID();
        const expiresAt = new Date(Date.now() + d.expiresInDays * 86400000).toISOString();
        db.prepare("INSERT INTO _portal_tokens(id,customer_id,label,token_hash,scopes_json,expires_at,created_by) VALUES(?,?,?,?,?,?,?)")
            .run(id, d.customerId, d.label, tokenHash, JSON.stringify(d.scopes), expiresAt, user.id);
        return { id, customerId: d.customerId, customerName: cust.name, label: d.label, scopes: d.scopes, expiresAt, token: rawToken };
    }

    function revokePortalToken(user, tokenId) {
        requireOwnerOrAdmin(user);
        const row = db.prepare("SELECT id FROM _portal_tokens WHERE id=?").get(tokenId);
        if (!row) fail("Portal token not found.", 404);
        db.prepare("UPDATE _portal_tokens SET revoked_at=CURRENT_TIMESTAMP WHERE id=?").run(tokenId);
        return { revoked: true, id: tokenId };
    }

    function portalView(rawToken) {
        if (!rawToken || !rawToken.startsWith("ofsp_")) fail("Valid customer portal token required.", 401);
        const tok = db.prepare("SELECT * FROM _portal_tokens WHERE token_hash=?").get(sha256(rawToken));
        if (!tok || tok.revoked_at || tok.expires_at <= new Date().toISOString()) fail("Portal token is expired or revoked.", 401);
        const scopes = new Set(JSON.parse(tok.scopes_json || "[]"));
        const customer = db.prepare("SELECT id,name,email,phone,address,city,state,zip FROM customers WHERE id=?").get(tok.customer_id);
        if (!customer) fail("Customer not found.", 404);

        const invoices = scopes.has("invoices")
            ? db.prepare("SELECT id,identifier,status,total,due_date AS dueDate,created_at AS createdAt FROM invoices WHERE customer_id=? AND status<>'draft' ORDER BY created_at DESC LIMIT 50").all(customer.id)
            : [];
        const completedJobs = scopes.has("reports")
            ? db.prepare("SELECT id,identifier,scheduled_date AS scheduledDate,status,notes FROM jobs WHERE customer_id=? AND status='completed' ORDER BY scheduled_date DESC LIMIT 50").all(customer.id)
            : [];
        const agreements = scopes.has("agreements") && hasTable("_agreement_drafts")
            ? db.prepare("SELECT id,title,version FROM _agreement_drafts WHERE customer_id=? AND archived=0 ORDER BY number DESC LIMIT 50").all(customer.id)
            : [];
        const acceptedQuotes = scopes.has("quotes") && hasTable("_sales_quote_offers")
            ? db.prepare(
                `SELECT o.id,o.quote_id AS quoteId,o.quote_version AS quoteVersion,o.offered_at AS offeredAt
                 FROM _sales_quote_offers o
                 JOIN _sales_quote_lifecycle_events e ON e.offer_id=o.id AND e.action='accepted'
                 WHERE o.customer_id=? ORDER BY e.recorded_at DESC LIMIT 50`
            ).all(customer.id)
            : [];

        return { customer, scopes: [...scopes], expiresAt: tok.expires_at, invoices, completedJobs, agreements, acceptedQuotes };
    }

    return {
        dashboard,
        listReports, saveReport, exportReport,
        listAutomations, saveAutomation, dryRunAutomation,
        listPortalTokens, issuePortalToken, revokePortalToken, portalView,
    };
}
