import { createHash } from "node:crypto";
import { transaction } from "../platform/sqlite.mjs";
import {
    parse, uuid, reader, writer, approver, fail,
    sovLineInput, billingAppInput, billingAppActionInput, wipSnapshotInput,
} from "./domain.mjs";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (cents) => "$" + ((cents || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function createProjectBilling({ db, get, replay, acknowledge, audit, delivery }) {
    const sovLines = (projectId) => db.prepare(
        `SELECT id,project_id AS projectId,phase_id AS phaseId,cost_code AS costCode,item_number AS itemNumber,
                description,scheduled_value_cents AS scheduledValueCents,change_order_id AS changeOrderId,
                position,version
         FROM _project_sov_lines WHERE project_id=? ORDER BY position,item_number,id`
    ).all(projectId);

    function saveSovLine(user, projectId, raw) {
        writer(user);
        const d = parse(sovLineInput, raw), fingerprint = hash({ action: "save_sov_line", projectId, ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            get(projectId);
            if (d.phaseId && !db.prepare("SELECT 1 FROM _project_phases WHERE id=? AND project_id=?").get(d.phaseId, projectId))
                fail("Phase does not belong to this project.", 404);
            if (d.changeOrderId) {
                const co = db.prepare("SELECT status FROM _project_change_orders WHERE id=? AND project_id=?").get(d.changeOrderId, projectId);
                if (!co) fail("Change order not found.", 404);
                if (co.status !== "approved") fail("Only approved change orders can be added to the Schedule of Values.", 409);
            }
            const old = db.prepare("SELECT * FROM _project_sov_lines WHERE id=?").get(d.id);
            if (old && old.project_id !== projectId) fail("SOV line does not belong to this project.", 404);
            if (old && old.version !== d.expectedVersion) fail("SOV line changed. Reload before saving.", 409);
            if (!old && d.expectedVersion !== 0) fail("SOV line does not exist.", 409);
            const version = (old?.version ?? 0) + 1;
            if (old) {
                db.prepare(
                    `UPDATE _project_sov_lines SET phase_id=?,cost_code=?,item_number=?,description=?,scheduled_value_cents=?,change_order_id=?,position=?,version=?
                     WHERE id=? AND version=?`
                ).run(d.phaseId, d.costCode, d.itemNumber, d.description, d.scheduledValueCents, d.changeOrderId, d.position, version, d.id, d.expectedVersion);
            } else {
                db.prepare(
                    `INSERT INTO _project_sov_lines(id,project_id,phase_id,cost_code,item_number,description,scheduled_value_cents,change_order_id,position,version)
                     VALUES(?,?,?,?,?,?,?,?,?,1)`
                ).run(d.id, projectId, d.phaseId, d.costCode, d.itemNumber, d.description, d.scheduledValueCents, d.changeOrderId, d.position);
            }
            const after = sovLines(projectId).find((l) => l.id === d.id);
            audit(projectId, user.id, old ? "update_sov_line" : "create_sov_line", "sov_line", d.id, old || {}, after, d.reason);
            const result = { sovLine: after };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    const billingApps = (projectId) => {
        const apps = db.prepare(
            `SELECT id,project_id AS projectId,application_number AS applicationNumber,period_start AS periodStart,
                    period_end AS periodEnd,status,retainage_bps AS retainageBps,
                    original_contract_cents AS originalContractCents,approved_changes_cents AS approvedChangesCents,
                    contract_to_date_cents AS contractToDateCents,total_completed_stored_cents AS totalCompletedStoredCents,
                    retainage_held_cents AS retainageHeldCents,total_earned_less_retainage_cents AS totalEarnedLessRetainageCents,
                    previous_certificates_cents AS previousCertificatesCents,current_payment_due_cents AS currentPaymentDueCents,
                    balance_to_finish_cents AS balanceToFinishCents,submitted_by AS submittedBy,submitted_at AS submittedAt,
                    certified_by AS certifiedBy,certified_at AS certifiedAt,invoice_id AS invoiceId,
                    payment_recorded_cents AS paymentRecordedCents,version,created_at AS createdAt,updated_at AS updatedAt
             FROM _project_billing_apps WHERE project_id=? ORDER BY application_number DESC`
        ).all(projectId);
        const lines = db.prepare(
            `SELECT l.id,l.application_id AS applicationId,l.sov_line_id AS sovLineId,s.item_number AS itemNumber,
                    s.description,l.scheduled_value_cents AS scheduledValueCents,l.previous_work_cents AS previousWorkCents,
                    l.current_work_cents AS currentWorkCents,l.materials_stored_cents AS materialsStoredCents,
                    l.total_completed_stored_cents AS totalCompletedStoredCents,l.retainage_cents AS retainageCents,
                    l.balance_to_finish_cents AS balanceToFinishCents
             FROM _project_billing_app_lines l
             JOIN _project_sov_lines s ON s.id=l.sov_line_id
             WHERE s.project_id=? ORDER BY s.position,s.item_number`
        ).all(projectId);
        return apps.map((a) => ({ ...a, lines: lines.filter((l) => l.applicationId === a.id) }));
    };

    function createBillingApp(user, projectId, raw) {
        writer(user);
        const d = parse(billingAppInput, raw), fingerprint = hash({ action: "create_billing_app", projectId, ...d });
        if (d.periodEnd < d.periodStart) fail("Billing period end cannot precede start.");
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            const project = get(projectId);
            const openApp = db.prepare("SELECT id,application_number FROM _project_billing_apps WHERE project_id=? AND status IN ('draft','in_review','submitted','returned')").get(projectId);
            if (openApp) fail(`Finish or approve Application #${openApp.application_number} before opening a new billing period.`, 409);

            const sov = sovLines(projectId);
            if (!sov.length) fail("Define Schedule of Values lines before creating a progress billing application.", 409);
            const sovById = new Map(sov.map((l) => [l.id, l]));

            const lastApproved = db.prepare(
                "SELECT * FROM _project_billing_apps WHERE project_id=? AND status='approved' ORDER BY application_number DESC LIMIT 1"
            ).get(projectId);
            const prevLinesBySov = new Map();
            if (lastApproved) {
                for (const pl of db.prepare("SELECT * FROM _project_billing_app_lines WHERE application_id=?").all(lastApproved.id)) {
                    prevLinesBySov.set(pl.sov_line_id, pl);
                }
            }

            const retainageBps = d.retainageBps ?? project.retainage_bps ?? 1000;
            const seen = new Set();
            const computedLines = [];
            for (const inputLine of d.lines) {
                if (seen.has(inputLine.sovLineId)) fail("Duplicate Schedule of Values line in billing application.");
                seen.add(inputLine.sovLineId);
                const s = sovById.get(inputLine.sovLineId);
                if (!s) fail("Schedule of Values line not found on this project.", 404);
                const prev = prevLinesBySov.get(s.id);
                const previousWorkCents = prev ? prev.total_completed_stored_cents : 0;
                const totalCompletedStoredCents = previousWorkCents + inputLine.currentWorkCents + inputLine.materialsStoredCents;
                if (totalCompletedStoredCents > s.scheduledValueCents) {
                    fail(`Line ${s.itemNumber} (${s.description}) exceeds its scheduled value (${money(totalCompletedStoredCents)} > ${money(s.scheduledValueCents)}).`, 409);
                }
                const retainageCents = Math.round((totalCompletedStoredCents * retainageBps) / 10000);
                const balanceToFinishCents = s.scheduledValueCents - totalCompletedStoredCents;
                computedLines.push({
                    sovLineId: s.id, itemNumber: s.itemNumber, description: s.description,
                    scheduledValueCents: s.scheduledValueCents, previousWorkCents,
                    currentWorkCents: inputLine.currentWorkCents, materialsStoredCents: inputLine.materialsStoredCents,
                    totalCompletedStoredCents, retainageCents, balanceToFinishCents,
                });
            }
            // Carry forward untouched SOV lines so cumulative totals stay exact
            for (const s of sov) {
                if (seen.has(s.id)) continue;
                const prev = prevLinesBySov.get(s.id);
                const previousWorkCents = prev ? prev.total_completed_stored_cents : 0;
                const retainageCents = Math.round((previousWorkCents * retainageBps) / 10000);
                computedLines.push({
                    sovLineId: s.id, itemNumber: s.itemNumber, description: s.description,
                    scheduledValueCents: s.scheduledValueCents, previousWorkCents,
                    currentWorkCents: 0, materialsStoredCents: 0,
                    totalCompletedStoredCents: previousWorkCents, retainageCents,
                    balanceToFinishCents: s.scheduledValueCents - previousWorkCents,
                });
            }

            const approvedChangesCents = delivery.changeOrders(projectId)
                .filter((c) => c.status === "approved")
                .reduce((sum, c) => sum + c.priceCents, 0);
            const sovTotalCents = sov.reduce((sum, s) => sum + s.scheduledValueCents, 0);
            const originalContractCents = project.contract_value_cents > 0 ? project.contract_value_cents : Math.max(0, sovTotalCents - approvedChangesCents);
            const contractToDateCents = sovTotalCents;
            const totalCompletedStoredCents = computedLines.reduce((sum, l) => sum + l.totalCompletedStoredCents, 0);
            const retainageHeldCents = computedLines.reduce((sum, l) => sum + l.retainageCents, 0);
            const totalEarnedLessRetainageCents = totalCompletedStoredCents - retainageHeldCents;
            const previousCertificatesCents = lastApproved ? lastApproved.total_earned_less_retainage_cents : 0;
            const currentPaymentDueCents = totalEarnedLessRetainageCents - previousCertificatesCents;
            if (currentPaymentDueCents < 0) fail("Current payment due cannot be negative; adjust prior over-billing via a deductive change order.", 409);
            const balanceToFinishCents = contractToDateCents - totalEarnedLessRetainageCents;

            const appNum = (db.prepare("SELECT COALESCE(MAX(application_number),0) AS n FROM _project_billing_apps WHERE project_id=?").get(projectId).n || 0) + 1;
            const snapshot = {
                applicationNumber: appNum, periodStart: d.periodStart, periodEnd: d.periodEnd, retainageBps,
                originalContractCents, approvedChangesCents, contractToDateCents, totalCompletedStoredCents,
                retainageHeldCents, totalEarnedLessRetainageCents, previousCertificatesCents, currentPaymentDueCents,
                balanceToFinishCents, lines: computedLines,
            };
            db.prepare(
                `INSERT INTO _project_billing_apps(
                    id,project_id,application_number,period_start,period_end,status,retainage_bps,
                    original_contract_cents,approved_changes_cents,contract_to_date_cents,
                    total_completed_stored_cents,retainage_held_cents,total_earned_less_retainage_cents,
                    previous_certificates_cents,current_payment_due_cents,balance_to_finish_cents,snapshot_json,version
                 ) VALUES(?,?,?,?,?,'draft',?,?,?,?,?,?,?,?,?,?,?,1)`
            ).run(
                d.id, projectId, appNum, d.periodStart, d.periodEnd, retainageBps,
                originalContractCents, approvedChangesCents, contractToDateCents,
                totalCompletedStoredCents, retainageHeldCents, totalEarnedLessRetainageCents,
                previousCertificatesCents, currentPaymentDueCents, balanceToFinishCents, JSON.stringify(snapshot)
            );
            const insertLine = db.prepare(
                `INSERT INTO _project_billing_app_lines(
                    id,application_id,sov_line_id,scheduled_value_cents,previous_work_cents,current_work_cents,
                    materials_stored_cents,total_completed_stored_cents,retainage_cents,balance_to_finish_cents
                 ) VALUES(?,?,?,?,?,?,?,?,?,?)`
            );
            for (const l of computedLines) {
                insertLine.run(`${d.id}:${l.sovLineId}`, d.id, l.sovLineId, l.scheduledValueCents, l.previousWorkCents, l.currentWorkCents, l.materialsStoredCents, l.totalCompletedStoredCents, l.retainageCents, l.balanceToFinishCents);
            }
            const after = billingApps(projectId).find((a) => a.id === d.id);
            audit(projectId, user.id, "create_billing_app", "billing_app", d.id, {}, after, d.reason);
            const result = { application: after };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    function transitionBillingApp(user, projectId, appId, raw) {
        parse(uuid, appId);
        const d = parse(billingAppActionInput, raw), fingerprint = hash({ action: "transition_billing_app", projectId, appId, ...d });
        if (["review", "submit"].includes(d.action)) writer(user);
        else approver(user);
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            get(projectId);
            const old = db.prepare("SELECT * FROM _project_billing_apps WHERE id=? AND project_id=?").get(appId, projectId);
            if (!old) fail("Billing application not found.", 404);
            if (old.version !== d.expectedVersion) fail("Billing application changed. Reload before updating.", 409);
            const version = old.version + 1;
            if (d.action === "review") {
                if (!["draft", "returned"].includes(old.status)) fail("Only draft or returned applications can move to review.", 409);
                db.prepare("UPDATE _project_billing_apps SET status='in_review',version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(version, appId);
            } else if (d.action === "submit") {
                if (!["draft", "in_review", "returned"].includes(old.status)) fail("Application cannot be submitted from its current state.", 409);
                const readiness = delivery.billingReadiness(projectId);
                if (!readiness.ready) fail(`Required field documentation is not yet approved (${readiness.pendingIds.length} pending).`, 409);
                db.prepare("UPDATE _project_billing_apps SET status='submitted',submitted_by=?,submitted_at=CURRENT_TIMESTAMP,version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(user.id, version, appId);
            } else if (d.action === "return") {
                if (!["in_review", "submitted"].includes(old.status)) fail("Only in-review or submitted applications can be returned.", 409);
                db.prepare("UPDATE _project_billing_apps SET status='returned',version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(version, appId);
            } else if (d.action === "approve") {
                if (old.status !== "submitted") fail("Submit the billing application before approving/certifying.", 409);
                db.prepare("UPDATE _project_billing_apps SET status='approved',certified_by=?,certified_at=CURRENT_TIMESTAMP,invoice_id=COALESCE(?,invoice_id),version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(user.id, d.invoiceId || null, version, appId);
            } else if (d.action === "record_payment") {
                if (old.status !== "approved") fail("Approve the billing application before recording payment.", 409);
                if (!d.paymentCents) fail("Specify a positive payment amount.");
                const nextPaid = old.payment_recorded_cents + d.paymentCents;
                if (nextPaid > old.current_payment_due_cents) fail("Recorded payment exceeds current payment due for this application.", 409);
                db.prepare("UPDATE _project_billing_apps SET payment_recorded_cents=?,version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(nextPaid, version, appId);
            }
            const after = billingApps(projectId).find((a) => a.id === appId);
            audit(projectId, user.id, `billing_app_${d.action}`, "billing_app", appId, old, after, d.reason);
            const result = { application: after };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    // COM-002 / CONST-002: Internal progress billing application & continuation sheet export (non-AIA-branded)
    function exportBillingAppHtml(user, projectId, appId) {
        reader(user);
        parse(uuid, projectId);
        parse(uuid, appId);
        const project = get(projectId);
        const customer = db.prepare("SELECT name FROM customers WHERE id=?").get(project.customer_id);
        const appRow = db.prepare("SELECT * FROM _project_billing_apps WHERE id=? AND project_id=?").get(appId, projectId);
        if (!appRow) fail("Billing application not found.", 404);
        const snap = JSON.parse(appRow.snapshot_json || "{}");
        const lines = snap.lines || [];
        const rowsHtml = lines.map((l) => {
            const pct = l.scheduledValueCents ? Math.round((l.totalCompletedStoredCents / l.scheduledValueCents) * 1000) / 10 : 0;
            return `<tr><td>${esc(l.itemNumber)}</td><td>${esc(l.description)}</td><td class="num">${money(l.scheduledValueCents)}</td><td class="num">${money(l.previousWorkCents)}</td><td class="num">${money(l.currentWorkCents)}</td><td class="num">${money(l.materialsStoredCents)}</td><td class="num">${money(l.totalCompletedStoredCents)}</td><td class="num">${pct}%</td><td class="num">${money(l.balanceToFinishCents)}</td><td class="num">${money(l.retainageCents)}</td></tr>`;
        }).join("");
        return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Application #${appRow.application_number} — ${esc(project.title)}</title><style>body{font-family:system-ui,sans-serif;margin:24px;color:#111}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}.num{text-align:right;font-variant-numeric:tabular-nums}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:12px 0;font-size:13px}.notice{font-size:11px;color:#555;margin-top:16px}</style></head><body><h1>Progress Billing Application #${appRow.application_number}</h1><div class="meta"><div><strong>Project:</strong> ${esc(project.title)}</div><div><strong>Customer:</strong> ${esc(customer?.name || project.customer_id)}</div><div><strong>Period:</strong> ${esc(appRow.period_start)} to ${esc(appRow.period_end)}</div><div><strong>Status:</strong> ${esc(appRow.status)}</div><div><strong>Original Contract:</strong> ${money(appRow.original_contract_cents)}</div><div><strong>Approved Changes:</strong> ${money(appRow.approved_changes_cents)}</div><div><strong>Contract to Date:</strong> ${money(appRow.contract_to_date_cents)}</div><div><strong>Total Completed &amp; Stored:</strong> ${money(appRow.total_completed_stored_cents)}</div><div><strong>Retainage (${(appRow.retainage_bps / 100).toFixed(2)}%):</strong> ${money(appRow.retainage_held_cents)}</div><div><strong>Earned Less Retainage:</strong> ${money(appRow.total_earned_less_retainage_cents)}</div><div><strong>Previous Certificates:</strong> ${money(appRow.previous_certificates_cents)}</div><div><strong>Current Payment Due:</strong> <strong>${money(appRow.current_payment_due_cents)}</strong></div></div><h2>Continuation Sheet (Schedule of Values)</h2><table><thead><tr><th>Item</th><th>Description</th><th class="num">Scheduled Value</th><th class="num">Previous</th><th class="num">This Period</th><th class="num">Stored Mat.</th><th class="num">Total to Date</th><th class="num">%</th><th class="num">Balance</th><th class="num">Retainage</th></tr></thead><tbody>${rowsHtml}</tbody></table><p class="notice">Generated by OpenFieldService from frozen Application #${appRow.application_number} (v${appRow.version}). Standard internal continuation format — not a licensed AIA-branded form. Application approval, invoicing and payment are tracked separately.</p></body></html>`;
    }

    // PROJ-008: Live WIP calculation + immutable period snapshots
    function computeWip(projectId, method = "cost_to_cost") {
        const project = get(projectId);
        const cos = delivery.changeOrders(projectId);
        const approvedChangesCents = cos.filter((c) => c.status === "approved").reduce((s, c) => s + c.priceCents, 0);
        const sovTotal = sovLines(projectId).reduce((s, l) => s + l.scheduledValueCents, 0);
        const contractValueCents = project.contract_value_cents > 0 ? project.contract_value_cents : Math.max(0, sovTotal - approvedChangesCents);
        const revisedContractCents = contractValueCents + approvedChangesCents;

        // Actual costs: approved crew labor + approved subcontractor invoices + received/billed purchasing + linked job invoices
        const crewLaborCents = delivery.crewTime(projectId)
            .filter((t) => t.status === "approved")
            .reduce((s, t) => s + t.laborCostCents, 0);
        const subRows = delivery.subcontractors(projectId);
        const subActualCents = subRows.reduce((s, r) => s + r.approvedInvoicedCents, 0);
        const subOpenCommitmentCents = subRows.reduce((s, r) => s + r.remainingCommitmentCents, 0);
        const subRetainageCents = subRows.reduce((s, r) => s + r.retainageHeldCents, 0);
        const purch = delivery.purchasingLinks(projectId).summary;
        const purchActualCents = Math.max(purch.receivedCents, purch.billedCents);
        const jobInvRow = db.prepare("SELECT COALESCE(SUM(i.total),0) AS actual FROM invoices i JOIN _project_jobs pj ON pj.job_id=i.job_id WHERE pj.project_id=?").get(projectId);
        const linkedJobActualCents = Math.round((jobInvRow?.actual || 0) * 100);

        const actualCostCents = crewLaborCents + subActualCents + purchActualCents + linkedJobActualCents;
        const committedCostCents = purch.openCommitmentCents + subOpenCommitmentCents;
        const baselineBudgetCents = project.baseline_cost_cents ?? 0;
        const estimateToCompleteCents = project.estimate_to_complete_cents != null
            ? project.estimate_to_complete_cents
            : Math.max(0, baselineBudgetCents - actualCostCents);
        const forecastAtCompletionCents = actualCostCents + estimateToCompleteCents;

        let percentCompleteBps = 0;
        if (method === "phase_progress") {
            const ph = db.prepare("SELECT percent_complete FROM _project_phases WHERE project_id=?").all(projectId);
            percentCompleteBps = ph.length ? Math.round((ph.reduce((s, r) => s + r.percent_complete, 0) / ph.length) * 100) : 0;
        } else {
            percentCompleteBps = forecastAtCompletionCents > 0
                ? Math.min(10000, Math.round((actualCostCents / forecastAtCompletionCents) * 10000))
                : 0;
        }

        const earnedRevenueCents = Math.round((revisedContractCents * percentCompleteBps) / 10000);
        const approvedApps = billingApps(projectId).filter((a) => a.status === "approved");
        const latestApproved = approvedApps[0] || null;
        const billedToDateCents = latestApproved ? latestApproved.totalCompletedStoredCents : 0;
        const retainageHeldCents = latestApproved ? latestApproved.retainageHeldCents : 0;
        // Positive = over-billed (liability), Negative = under-billed (asset)
        const overUnderBillingCents = billedToDateCents - earnedRevenueCents;
        const estimatedGrossProfitCents = revisedContractCents - forecastAtCompletionCents;

        return {
            method,
            computedAt: new Date().toISOString(),
            note: "Operational WIP estimate; separate from posted accounting revenue.",
            contractValueCents, approvedChangesCents, revisedContractCents,
            percentCompleteBps, percentComplete: Math.round(percentCompleteBps / 10) / 10,
            earnedRevenueCents, actualCostCents, committedCostCents,
            estimateToCompleteCents, forecastAtCompletionCents, estimatedGrossProfitCents,
            billedToDateCents, overUnderBillingCents, retainageHeldCents, subRetainageCents,
            sources: { crewLaborCents, subActualCents, purchActualCents, linkedJobActualCents, purchOpenCommitmentCents: purch.openCommitmentCents, subOpenCommitmentCents },
        };
    }

    const wipSnapshots = (projectId) => db.prepare(
        `SELECT id,project_id AS projectId,as_of_date AS asOfDate,method,contract_value_cents AS contractValueCents,
                approved_changes_cents AS approvedChangesCents,revised_contract_cents AS revisedContractCents,
                percent_complete_bps AS percentCompleteBps,earned_revenue_cents AS earnedRevenueCents,
                actual_cost_cents AS actualCostCents,committed_cost_cents AS committedCostCents,
                estimate_to_complete_cents AS estimateToCompleteCents,forecast_at_completion_cents AS forecastAtCompletionCents,
                billed_to_date_cents AS billedToDateCents,over_under_billing_cents AS overUnderBillingCents,
                retainage_held_cents AS retainageHeldCents,approved_by AS approvedBy,approved_at AS approvedAt,
                correction_of AS correctionOf,created_at AS createdAt
         FROM _project_wip_snapshots WHERE project_id=? ORDER BY as_of_date DESC,created_at DESC`
    ).all(projectId);

    function createWipSnapshot(user, projectId, raw) {
        approver(user);
        const d = parse(wipSnapshotInput, raw), fingerprint = hash({ action: "create_wip_snapshot", projectId, ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fingerprint); if (prior) return prior;
            get(projectId);
            if (d.correctionOf && !db.prepare("SELECT 1 FROM _project_wip_snapshots WHERE id=? AND project_id=?").get(d.correctionOf, projectId))
                fail("Prior WIP snapshot not found.", 404);
            const wip = computeWip(projectId, d.method);
            db.prepare(
                `INSERT INTO _project_wip_snapshots(
                    id,project_id,as_of_date,method,contract_value_cents,approved_changes_cents,revised_contract_cents,
                    percent_complete_bps,earned_revenue_cents,actual_cost_cents,committed_cost_cents,
                    estimate_to_complete_cents,forecast_at_completion_cents,billed_to_date_cents,
                    over_under_billing_cents,retainage_held_cents,snapshot_json,approved_by,correction_of
                 ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
            ).run(
                d.id, projectId, d.asOfDate, d.method, wip.contractValueCents, wip.approvedChangesCents, wip.revisedContractCents,
                wip.percentCompleteBps, wip.earnedRevenueCents, wip.actualCostCents, wip.committedCostCents,
                wip.estimateToCompleteCents, wip.forecastAtCompletionCents, wip.billedToDateCents,
                wip.overUnderBillingCents, wip.retainageHeldCents, JSON.stringify(wip), user.id, d.correctionOf
            );
            const snap = wipSnapshots(projectId).find((s) => s.id === d.id);
            audit(projectId, user.id, d.correctionOf ? "correct_wip_snapshot" : "approve_wip_snapshot", "wip_snapshot", d.id, {}, snap, d.reason);
            const result = { snapshot: snap };
            acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }

    return {
        sovLines, saveSovLine,
        billingApps, createBillingApp, transitionBillingApp, exportBillingAppHtml,
        computeWip, wipSnapshots, createWipSnapshot,
    };
}
