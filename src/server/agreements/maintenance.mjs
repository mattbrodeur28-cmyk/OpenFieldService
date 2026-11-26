import { z } from 'zod';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { parse, uuid, reader, writer, fail } from './domain.mjs';
import { companyDay, termState } from './activation.mjs';

const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const requiredDate = z.string().refine(v => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Choose a valid Company date.');
const reason = z.string().trim().min(10).max(2000);
const checklistItem = z.object({ label: z.string().trim().min(1).max(200), required: z.boolean() });
const planInput = z.object({ id: uuid, requestKey: uuid, expectedVersion: z.number().int().nonnegative().safe(), title: z.string().trim().min(1).max(200), description: z.string().trim().max(2000), frequency: z.enum(['monthly', 'quarterly', 'annual']), firstDue: requiredDate, horizonDays: z.number().int().min(1).max(730), seasonalMonths: z.array(z.number().int().min(1).max(12)).max(12), checklist: z.array(checklistItem).min(1).max(100), assetIds: z.array(uuid).min(1).max(500), archived: z.boolean(), reason, reviewAttested: z.literal(true) }).strict().refine(d => new Set(d.seasonalMonths).size === d.seasonalMonths.length, 'Seasonal months must not repeat.').refine(d => new Set(d.assetIds).size === d.assetIds.length, 'Equipment must not repeat.');
const generateInput = z.object({ id: uuid, requestKey: uuid, from: requiredDate.optional(), to: requiredDate.optional(), reason, reviewAttested: z.literal(true) }).strict().refine(d => !d.from || !d.to || d.from <= d.to, 'End date must not precede start date.');
const skipInput = z.object({ id: uuid, requestKey: uuid, planId: uuid, assetId: uuid, dueOn: requiredDate, reason, reviewAttested: z.literal(true) }).strict();
const previewQuery = z.object({ from: requiredDate.optional(), to: requiredDate.optional() }).strict();

const frequencyMonths = { monthly: 1, quarterly: 3, annual: 12 };
function addMonths(dateStr, months) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const total = m - 1 + months;
    const year = y + Math.floor(total / 12);
    const month = ((total % 12) + 12) % 12 + 1;
    const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, dim)).padStart(2, '0')}`;
}
function addDays(dateStr, days) {
    const base = new Date(dateStr + 'T00:00:00Z');
    base.setUTCDate(base.getUTCDate() + days);
    return base.toISOString().slice(0, 10);
}
function occurrences(rev, from, to, shift = (d) => d) {
    const step = frequencyMonths[rev.frequency], seasonal = new Set(rev.seasonalMonths), out = [];
    let cursor = rev.firstDue, n = 0;
    while (cursor <= to && n <= 100000) {
        if (cursor >= from && (seasonal.size === 0 || seasonal.has(Number(cursor.slice(5, 7)))))
            out.push(shift(cursor));
        n += 1;
        cursor = addMonths(rev.firstDue, step * n);
    }
    return out;
}

export function createAgreementMaintenance({ db, repo, get, timeZone = () => 'UTC', clock = () => new Date(), jobs }) {
    function now() {
        const value = clock();
        if (!Number.isFinite(value.getTime()))
            throw new Error('Agreement clock is invalid.');
        return value;
    }
    function today() { return companyDay(now(), timeZone()); }
    // CONTRACT-004: shift a due date that falls on a company-closed day (weekend or a
    // dated holiday exception in Dispatcher operating hours) to the next open day.
    // When hours are not configured, no shifting occurs.
    function isOpen(date) {
        if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_dispatch_operating_settings'").get())
            return true;
        const settings = db.prepare('SELECT enabled FROM _dispatch_operating_settings WHERE id=1').get();
        if (!settings?.enabled)
            return true;
        const special = db.prepare('SELECT open FROM _dispatch_operating_exceptions WHERE date=?').get(date);
        if (special)
            return special.open === 1;
        const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
        const weekly = db.prepare('SELECT open FROM _dispatch_operating_weekly WHERE weekday=?').get(weekday);
        return weekly ? weekly.open === 1 : true;
    }
    function nextOpenDay(date) {
        let cursor = date;
        for (let i = 0; i < 400; i++) {
            if (isOpen(cursor))
                return cursor;
            cursor = addDays(cursor, 1);
        }
        return date;
    }
    const projectRevision = ({ seasonal_months_json, checklist_json, asset_ids_json, ...row }) => ({ ...row, seasonalMonths: JSON.parse(seasonal_months_json), checklist: JSON.parse(checklist_json), assetIds: JSON.parse(asset_ids_json) });
    const revisionHead = id => {
        const row = db.prepare('SELECT plan_id AS planId,version,title,description,frequency,first_due AS firstDue,horizon_days AS horizonDays,seasonal_months_json,checklist_json,asset_ids_json,actor_id AS actorId,reason,created_at AS createdAt FROM _agreement_plan_revisions WHERE plan_id=? ORDER BY version DESC LIMIT 1').get(id);
        return row ? projectRevision(row) : null;
    };
    const planRow = id => {
        const head = db.prepare('SELECT id,agreement_id AS agreementId,title,archived,version,updated_by AS updatedBy,updated_at AS updatedAt FROM _agreement_maintenance_plans WHERE id=?').get(id);
        if (!head)
            return null;
        const rev = revisionHead(id), assets = db.prepare('SELECT a.id,a.name,a.serial_number AS serialNumber,a.site_id AS siteId FROM _agreement_plan_assets p JOIN assets a ON a.id=p.asset_id WHERE p.plan_id=? ORDER BY a.name,a.id').all(id).map(row => ({ ...row }));
        return { ...head, ...rev, assets };
    };
    const inAgreement = (planId, agreementId) => {
        const plan = planRow(planId);
        if (!plan || plan.agreementId !== agreementId)
            fail('Maintenance plan not found for this agreement.', 404);
        return plan;
    };
    function replay(user, key, fingerprint) {
        const prior = repo.prior(key);
        if (!prior)
            return null;
        if (prior.actor_id !== user.id)
            fail('This request belongs to another account.', 403);
        if (prior.request_hash !== fingerprint)
            fail('Request key has different maintenance content.', 409);
        return JSON.parse(prior.result_json);
    }
    function validateScope(agreement, assetIds) {
        const owned = new Set(agreement.document.assetIds);
        for (const id of assetIds) {
            if (!owned.has(id))
                fail('Every maintenance equipment item must be in the agreement’s selected scope.', 409);
            const asset = db.prepare('SELECT customer_id,site_id,status FROM assets WHERE id=?').get(id);
            if (!asset || asset.customer_id !== agreement.customer_id || !agreement.document.siteIds.includes(asset.site_id))
                fail('Maintenance equipment must still belong to this customer and a selected location.', 409);
        }
    }
    function save(user, agreementId, raw) {
        writer(user);
        parse(uuid, agreementId);
        const d = parse(planInput, raw), fingerprint = hash({ action: 'save_agreement_plan', agreementId, ...d });
        return repo.within(() => {
            const previous = replay(user, d.requestKey, fingerprint);
            if (previous)
                return previous;
            const agreement = get(agreementId);
            if (agreement.archived)
                fail('Restore the agreement before saving maintenance plans.', 409);
            validateScope(agreement, d.assetIds);
            const old = planRow(d.id);
            if (old && old.agreementId !== agreementId)
                fail('Maintenance plan cannot move between agreements.', 409);
            if ((old?.version ?? 0) !== d.expectedVersion)
                fail('Maintenance plan changed. Reload and review before saving.', 409);
            if (d.expectedVersion === Number.MAX_SAFE_INTEGER)
                fail('Maintenance plan version needs administrator review.', 409);
            if (db.prepare('SELECT 1 FROM _agreement_maintenance_plans WHERE id=?').get(d.id))
                db.prepare('UPDATE _agreement_maintenance_plans SET title=?,archived=?,version=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(d.title, Number(d.archived), d.expectedVersion + 1, user.id, d.id);
            else
                db.prepare('INSERT INTO _agreement_maintenance_plans(id,agreement_id,title,archived,version,updated_by) VALUES(?,?,?,?,?,?)').run(d.id, agreementId, d.title, Number(d.archived), 1, user.id);
            const version = d.expectedVersion + 1;
            db.prepare('INSERT INTO _agreement_plan_revisions(plan_id,version,title,description,frequency,first_due,horizon_days,seasonal_months_json,checklist_json,asset_ids_json,actor_id,reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(d.id, version, d.title, d.description, d.frequency, d.firstDue, d.horizonDays, JSON.stringify(d.seasonalMonths), JSON.stringify(d.checklist), JSON.stringify(d.assetIds), user.id, d.reason);
            db.prepare('DELETE FROM _agreement_plan_assets WHERE plan_id=?').run(d.id);
            for (const assetId of d.assetIds)
                db.prepare('INSERT INTO _agreement_plan_assets(plan_id,asset_id) VALUES(?,?)').run(d.id, assetId);
            const result = { plan: planRow(d.id), workGenerated: false, communicationSent: false };
            repo.acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }
    function detail(user, agreementId, planId) {
        reader(user);
        parse(uuid, agreementId);
        parse(uuid, planId);
        return repo.within(() => {
            get(agreementId);
            return { plan: inAgreement(planId, agreementId) };
        });
    }
    function history(user, agreementId, planId) {
        reader(user);
        parse(uuid, agreementId);
        parse(uuid, planId);
        return repo.within(() => {
            inAgreement(planId, agreementId);
            return { planId, rows: db.prepare('SELECT plan_id AS planId,version,title,description,frequency,first_due AS firstDue,horizon_days AS horizonDays,seasonal_months_json,checklist_json,asset_ids_json,actor_id AS actorId,reason,created_at AS createdAt FROM _agreement_plan_revisions WHERE plan_id=? ORDER BY version DESC').all(planId).map(projectRevision) };
        });
    }
    function plans(user, agreementId) {
        reader(user);
        parse(uuid, agreementId);
        return repo.within(() => {
            get(agreementId);
            return { agreementId, rows: db.prepare('SELECT id FROM _agreement_maintenance_plans WHERE agreement_id=? AND archived=0 ORDER BY title,id').all(agreementId).map(r => planRow(r.id)) };
        });
    }
    function activationAndOffer(agreementId) {
        const activation = repo.activation(agreementId);
        if (!activation)
            return { activation: null, offer: null, cancellation: null };
        return { activation, cancellation: repo.activationCancellation(activation.id), offer: repo.offerById(activation.offerId) };
    }
    function scopeBlock(agreementId, assetId, dueOn) {
        const { activation, offer, cancellation } = activationAndOffer(agreementId);
        if (!activation || !offer)
            return 'Agreement operational authorization is required before generating work.';
        if (termState(activation, cancellation, dueOn) !== 'active')
            return 'The accepted term is not active on this date.';
        const frozen = offer.snapshot.source.scope.assets.find(item => item.id === assetId);
        if (!frozen)
            return 'Equipment is outside the accepted scope.';
        const current = repo.activationAsset(assetId);
        if (!current || current.customerId !== offer.snapshot.source.document.customerId || current.siteId !== frozen.siteId)
            return 'Equipment ownership or location changed since acceptance.';
        if (current.status === 'retired')
            return 'Equipment is retired.';
        return null;
    }
    function pending(agreementId, from, to) {
        const due = [], blocked = [];
        const rows = db.prepare('SELECT id FROM _agreement_maintenance_plans WHERE agreement_id=? AND archived=0 ORDER BY title,id').all(agreementId);
        for (const { id: planId } of rows) {
            const plan = planRow(planId);
            for (const asset of plan.assets) {
                for (const dueOn of occurrences(plan, from, to, nextOpenDay)) {
                    if (db.prepare('SELECT 1 FROM _agreement_due_work WHERE plan_id=? AND asset_id=? AND due_on=?').get(planId, asset.id, dueOn))
                        continue;
                    const blockedReason = scopeBlock(agreementId, asset.id, dueOn);
                    const item = { planId, assetId: asset.id, assetName: asset.name, dueOn, planTitle: plan.title, checklist: plan.checklist };
                    (blockedReason ? blocked : due).push({ ...item, blockedReason });
                }
            }
        }
        return { due, blocked };
    }
    function preview(user, agreementId, query = {}) {
        reader(user);
        parse(uuid, agreementId);
        const q = parse(previewQuery, query);
        return repo.within(() => {
            get(agreementId);
            const from = q.from ?? today(), to = q.to ?? addDays(from, 366), result = pending(agreementId, from, to);
            return { agreementId, from, to, observedAt: now().toISOString(), due: result.due, blocked: result.blocked, workGenerated: false };
        });
    }
    function generate(user, agreementId, raw) {
        writer(user);
        parse(uuid, agreementId);
        const d = parse(generateInput, raw), fingerprint = hash({ action: 'generate_agreement_work', agreementId, ...d });
        return repo.within(() => {
            const previous = replay(user, d.requestKey, fingerprint);
            if (previous)
                return previous;
            get(agreementId);
            const from = d.from ?? today(), to = d.to ?? addDays(from, 366);
            const { due, blocked } = pending(agreementId, from, to);
            const generated = [];
            for (const item of due) {
                const plan = planRow(item.planId), jobId = randomUUID(), checklistText = item.checklist.map(c => (c.required ? '• ' : '○ ') + c.label).join('\n'), notes = [plan.title, plan.description, 'Preventive maintenance checklist:', checklistText].filter(Boolean).join('\n\n');
                const job = jobs.createInTransaction(user, { id: jobId, customerId: get(agreementId).customer_id, siteId: db.prepare('SELECT site_id AS siteId FROM assets WHERE id=?').get(item.assetId).siteId, assetId: item.assetId, serviceTypeId: null, planningDate: item.dueOn, durationMinutes: 60, title: plan.title, notes });
                db.prepare('INSERT INTO _agreement_due_work(id,plan_id,asset_id,due_on,job_id) VALUES(?,?,?,?,?)').run(randomUUID(), item.planId, item.assetId, item.dueOn, jobId);
                generated.push({ planId: item.planId, assetId: item.assetId, assetName: item.assetName, dueOn: item.dueOn, job });
            }
            const result = { agreementId, from, to, generated, blocked, workGenerated: generated.length > 0, communicationSent: false };
            repo.acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }
    function skip(user, agreementId, raw) {
        writer(user);
        parse(uuid, agreementId);
        const d = parse(skipInput, raw), fingerprint = hash({ action: 'skip_agreement_work', agreementId, ...d });
        return repo.within(() => {
            const previous = replay(user, d.requestKey, fingerprint);
            if (previous)
                return previous;
            get(agreementId);
            const plan = inAgreement(d.planId, agreementId);
            if (!plan.assets.some(a => a.id === d.assetId))
                fail('Choose equipment within this maintenance plan.', 409);
            if (!occurrences(plan, plan.firstDue, d.dueOn, nextOpenDay).includes(d.dueOn))
                fail('This date is not a scheduled occurrence for the plan.', 409);
            if (db.prepare('SELECT 1 FROM _agreement_due_work WHERE plan_id=? AND asset_id=? AND due_on=?').get(d.planId, d.assetId, d.dueOn))
                fail('This occurrence is already generated or skipped.', 409);
            db.prepare('INSERT INTO _agreement_due_work(id,plan_id,asset_id,due_on,skipped_by,skip_reason) VALUES(?,?,?,?,?,?)').run(d.id, d.planId, d.assetId, d.dueOn, user.id, d.reason);
            const result = { agreementId, planId: d.planId, assetId: d.assetId, dueOn: d.dueOn, skipped: true, workGenerated: false, communicationSent: false };
            repo.acknowledge(d.requestKey, user, fingerprint, result);
            return result;
        });
    }
    return { save, detail, history, plans, preview, generate, skip };
}
