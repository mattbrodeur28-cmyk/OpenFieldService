import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { migrate, transaction } from "../platform/sqlite.mjs";
import { residentialSchema } from "./schema.mjs";

export class ResidentialError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = (msg, status = 400) => { throw new ResidentialError(msg, status); };
const parse = (schema, raw) => {
    const r = schema.safeParse(raw);
    if (!r.success) fail(r.error.issues.map((i) => i.message).join("; "));
    return r.data;
};
const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const uuid = z.string().uuid();
const ymd = z.string().refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)), "Choose a valid YYYY-MM-DD date.");

function requireReader(user) {
    if (!user?.active || user.mustChangePassword) fail("Sign in to continue.", 401);
}
function requireWriter(user) {
    requireReader(user);
    if (!["owner", "admin", "member"].includes(user.role)) fail("Your account cannot modify residential records.", 403);
}
function requireAdmin(user) {
    requireReader(user);
    if (!["owner", "admin"].includes(user.role)) fail("Owner or Admin access is required.", 403);
}

const planInput = z.object({
    id: uuid.optional(),
    name: z.string().trim().min(1).max(120),
    billingCycle: z.enum(["monthly", "quarterly", "annual"]).default("annual"),
    priceCents: z.number().int().nonnegative().max(100000000),
    visitsPerYear: z.number().int().min(0).max(24).default(2),
    discountBps: z.number().int().min(0).max(5000).default(1000),
    benefitsText: z.string().trim().max(4000).default(""),
    active: z.boolean().default(true),
}).strict();

const enrollInput = z.object({
    id: uuid.optional(),
    requestKey: uuid,
    customerId: uuid,
    siteId: uuid.nullable().default(null),
    assetId: uuid.nullable().default(null),
    planId: uuid,
    startsOn: ymd,
    renewalDate: ymd,
    autoRenewAuthorized: z.boolean().default(false),
    authorizedBy: z.string().trim().max(120).default(""),
}).strict();

const membershipStatusInput = z.object({
    status: z.enum(["pending", "active", "payment_failed", "expired", "cancelled"]),
}).strict();

const pricebookInput = z.object({
    id: uuid.optional(),
    code: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(160),
    category: z.string().trim().min(1).max(60).default("service"),
    description: z.string().trim().max(2000).default(""),
    unitPriceCents: z.number().int().nonnegative().max(100000000),
    memberDiscountEligible: z.boolean().default(true),
    taxable: z.boolean().default(true),
    active: z.boolean().default(true),
}).strict();

const tierSchema = z.object({
    label: z.string().trim().min(1).max(80),
    summary: z.string().trim().max(1000).default(""),
    items: z.array(z.object({
        name: z.string().trim().min(1).max(160),
        quantity: z.number().positive().max(10000),
        unitPriceCents: z.number().int().nonnegative().max(100000000),
    }).strict()).min(1).max(50),
    taxCents: z.number().int().nonnegative().max(100000000).default(0),
}).strict();

const estimateInput = z.object({
    id: uuid.optional(),
    requestKey: uuid,
    customerId: uuid,
    siteId: uuid.nullable().default(null),
    assetId: uuid.nullable().default(null),
    jobId: uuid.nullable().default(null),
    title: z.string().trim().min(1).max(200),
    options: z.object({ good: tierSchema, better: tierSchema, best: tierSchema }).strict(),
}).strict();

const acceptEstimateInput = z.object({
    requestKey: uuid,
    chosenTier: z.enum(["good", "better", "best"]),
    acceptedBy: z.string().trim().min(1).max(120),
    createInvoice: z.boolean().default(true),
}).strict();

const bookingInput = z.object({
    id: uuid.optional(),
    requestKey: uuid,
    customerId: uuid,
    siteId: uuid.nullable().default(null),
    assetId: uuid.nullable().default(null),
    channel: z.enum(["phone", "online", "after_hours", "ai_assisted"]).default("phone"),
    issue: z.string().trim().min(3).max(2000),
    urgency: z.enum(["normal", "high", "urgent", "emergency"]).default("normal"),
    preferredDate: ymd,
    preferredWindow: z.string().trim().min(1).max(40).default("morning"),
}).strict();

const dispatchBookingInput = z.object({
    requestKey: uuid,
    technicianId: uuid.nullable().default(null),
    scheduledDate: ymd.optional(),
    scheduledTime: z.string().trim().max(10).default("09:00"),
}).strict();

const paymentIntentInput = z.object({
    requestKey: uuid,
    invoiceId: uuid,
    provider: z.string().trim().min(1).max(60).default("manual_terminal"),
    providerTokenRef: z.string().trim().max(160).default(""),
    amountCents: z.number().int().positive().max(1000000000),
    status: z.enum(["pending", "succeeded", "declined", "partially_paid", "refunded"]).default("succeeded"),
    notes: z.string().trim().max(1000).default(""),
}).strict();

const financingInput = z.object({
    customerId: uuid,
    estimateId: uuid.nullable().default(null),
    providerName: z.string().trim().min(1).max(120),
    requestedCents: z.number().int().positive().max(1000000000),
    externalRef: z.string().trim().max(120).default(""),
}).strict();

export function createResidentialService({ storage }) {
    const db = storage.database;
    migrate(db, "_residential_migrations", [{ version: 1, sql: residentialSchema }]);

    const checkCustomer = (id) => {
        const c = db.prepare("SELECT id,name,address FROM customers WHERE id=?").get(id);
        if (!c) fail("Customer not found.", 404);
        return c;
    };
    const replay = (user, key, fp) => {
        const prev = db.prepare("SELECT actor_id,request_hash,response_json FROM _res_requests WHERE request_key=?").get(key);
        if (!prev) return null;
        if (prev.actor_id !== user.id) fail("This request belongs to another account.", 403);
        if (prev.request_hash !== fp) fail("Request key was already used with different data.", 409);
        return JSON.parse(prev.response_json);
    };
    const ack = (key, user, fp, res) =>
        db.prepare("INSERT INTO _res_requests(request_key,actor_id,request_hash,response_json) VALUES(?,?,?,?)").run(key, user.id, fp, JSON.stringify(res));

    const computeTier = (tier) => {
        const subtotalCents = tier.items.reduce((s, i) => s + Math.round(i.quantity * i.unitPriceCents), 0);
        return { ...tier, subtotalCents, totalCents: subtotalCents + tier.taxCents };
    };

    // RES-001: Membership plans & enrollments
    const listPlans = (user) => {
        requireReader(user);
        return db.prepare("SELECT id,name,billing_cycle AS billingCycle,price_cents AS priceCents,visits_per_year AS visitsPerYear,discount_bps AS discountBps,benefits_text AS benefitsText,active,version FROM _res_membership_plans ORDER BY price_cents,name").all()
            .map((r) => ({ ...r, active: r.active === 1 }));
    };

    function savePlan(user, raw) {
        requireAdmin(user);
        const d = parse(planInput, raw);
        const id = d.id || randomUUID();
        return transaction(db, () => {
            db.prepare(
                `INSERT INTO _res_membership_plans(id,name,billing_cycle,price_cents,visits_per_year,discount_bps,benefits_text,active,version)
                 VALUES(?,?,?,?,?,?,?,?,1)
                 ON CONFLICT(id) DO UPDATE SET name=excluded.name,billing_cycle=excluded.billing_cycle,price_cents=excluded.price_cents,
                 visits_per_year=excluded.visits_per_year,discount_bps=excluded.discount_bps,benefits_text=excluded.benefits_text,
                 active=excluded.active,version=version+1`
            ).run(id, d.name, d.billingCycle, d.priceCents, d.visitsPerYear, d.discountBps, d.benefitsText, Number(d.active));
            return { plan: listPlans(user).find((p) => p.id === id) };
        });
    }

    const listMemberships = (user) => {
        requireReader(user);
        return db.prepare(
            `SELECT m.id,m.customer_id AS customerId,c.name AS customerName,m.site_id AS siteId,m.asset_id AS assetId,
                    m.plan_id AS planId,m.plan_name AS planName,m.price_cents AS priceCents,m.discount_bps AS discountBps,
                    m.status,m.starts_on AS startsOn,m.renewal_date AS renewalDate,
                    m.auto_renew_authorized AS autoRenewAuthorized,m.authorized_by AS authorizedBy,m.authorized_at AS authorizedAt
             FROM _res_memberships m JOIN customers c ON c.id=m.customer_id ORDER BY m.created_at DESC`
        ).all().map((r) => ({ ...r, autoRenewAuthorized: r.autoRenewAuthorized === 1 }));
    };

    function enrollMembership(user, raw) {
        requireWriter(user);
        const d = parse(enrollInput, raw);
        if (d.autoRenewAuthorized && !d.authorizedBy) fail("Record who authorized automatic renewal.");
        if (d.renewalDate < d.startsOn) fail("Renewal date cannot precede start date.");
        const fp = hash({ action: "enroll_membership", ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fp); if (prior) return prior;
            checkCustomer(d.customerId);
            const plan = db.prepare("SELECT * FROM _res_membership_plans WHERE id=? AND active=1").get(d.planId);
            if (!plan) fail("Choose an active membership plan.", 404);
            const id = d.id || randomUUID();
            const authAt = d.autoRenewAuthorized ? new Date().toISOString() : null;
            db.prepare(
                `INSERT INTO _res_memberships(id,customer_id,site_id,asset_id,plan_id,plan_name,price_cents,discount_bps,status,starts_on,renewal_date,auto_renew_authorized,authorized_by,authorized_at)
                 VALUES(?,?,?,?,?,?,?,?,'active',?,?,?,?,?)`
            ).run(id, d.customerId, d.siteId, d.assetId, plan.id, plan.name, plan.price_cents, plan.discount_bps, d.startsOn, d.renewalDate, Number(d.autoRenewAuthorized), d.authorizedBy, authAt);
            const res = { membership: listMemberships(user).find((m) => m.id === id) };
            ack(d.requestKey, user, fp, res);
            return res;
        });
    }

    function updateMembershipStatus(user, id, raw) {
        requireWriter(user);
        parse(uuid, id);
        const d = parse(membershipStatusInput, raw);
        const existing = db.prepare("SELECT id FROM _res_memberships WHERE id=?").get(id);
        if (!existing) fail("Membership not found.", 404);
        db.prepare("UPDATE _res_memberships SET status=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(d.status, id);
        return { membership: listMemberships(user).find((m) => m.id === id) };
    }

    // RES-002: Pricebook & Good / Better / Best 3-option tablet estimates
    const listPricebook = (user) => {
        requireReader(user);
        return db.prepare("SELECT id,code,name,category,description,unit_price_cents AS unitPriceCents,member_discount_eligible AS memberDiscountEligible,taxable,active,version FROM _res_pricebook_items ORDER BY category,name").all()
            .map((r) => ({ ...r, memberDiscountEligible: r.memberDiscountEligible === 1, taxable: r.taxable === 1, active: r.active === 1 }));
    };

    function savePricebookItem(user, raw) {
        requireAdmin(user);
        const d = parse(pricebookInput, raw);
        const id = d.id || randomUUID();
        db.prepare(
            `INSERT INTO _res_pricebook_items(id,code,name,category,description,unit_price_cents,member_discount_eligible,taxable,active,version)
             VALUES(?,?,?,?,?,?,?,?,?,1)
             ON CONFLICT(id) DO UPDATE SET code=excluded.code,name=excluded.name,category=excluded.category,description=excluded.description,
             unit_price_cents=excluded.unit_price_cents,member_discount_eligible=excluded.member_discount_eligible,taxable=excluded.taxable,
             active=excluded.active,version=version+1,updated_at=CURRENT_TIMESTAMP`
        ).run(id, d.code, d.name, d.category, d.description, d.unitPriceCents, Number(d.memberDiscountEligible), Number(d.taxable), Number(d.active));
        return { item: listPricebook(user).find((i) => i.id === id) };
    }

    const listEstimates = (user) => {
        requireReader(user);
        return db.prepare(
            `SELECT e.id,e.customer_id AS customerId,c.name AS customerName,e.site_id AS siteId,e.asset_id AS assetId,
                    e.job_id AS jobId,e.invoice_id AS invoiceId,e.title,e.options_json AS optionsJson,
                    e.chosen_tier AS chosenTier,e.accepted_total_cents AS acceptedTotalCents,e.accepted_by AS acceptedBy,
                    e.accepted_at AS acceptedAt,e.status,e.created_by AS createdBy,e.version,e.created_at AS createdAt
             FROM _res_estimates e JOIN customers c ON c.id=e.customer_id ORDER BY e.created_at DESC`
        ).all().map((r) => ({ ...r, options: JSON.parse(r.optionsJson) }));
    };

    function createEstimate(user, raw) {
        requireWriter(user);
        const d = parse(estimateInput, raw);
        const fp = hash({ action: "create_res_estimate", ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fp); if (prior) return prior;
            checkCustomer(d.customerId);
            const options = {
                good: computeTier(d.options.good),
                better: computeTier(d.options.better),
                best: computeTier(d.options.best),
            };
            const id = d.id || randomUUID();
            db.prepare(
                `INSERT INTO _res_estimates(id,customer_id,site_id,asset_id,job_id,title,options_json,status,created_by)
                 VALUES(?,?,?,?,?,?,?,'presented',?)`
            ).run(id, d.customerId, d.siteId, d.assetId, d.jobId, d.title, JSON.stringify(options), user.id);
            const res = { estimate: listEstimates(user).find((e) => e.id === id) };
            ack(d.requestKey, user, fp, res);
            return res;
        });
    }

    function acceptEstimate(user, estimateId, raw) {
        requireWriter(user);
        parse(uuid, estimateId);
        const d = parse(acceptEstimateInput, raw);
        const fp = hash({ action: "accept_res_estimate", estimateId, ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fp); if (prior) return prior;
            const est = db.prepare("SELECT * FROM _res_estimates WHERE id=?").get(estimateId);
            if (!est) fail("Residential estimate not found.", 404);
            if (["accepted", "converted"].includes(est.status)) fail("Estimate has already been accepted.", 409);
            const options = JSON.parse(est.options_json);
            const chosen = options[d.chosenTier];
            if (!chosen) fail("Invalid option tier.");

            let jobId = est.job_id;
            if (!jobId) {
                jobId = randomUUID();
                const cust = checkCustomer(est.customer_id);
                const jobNum = "RES-" + String(Date.now()).slice(-6);
                db.prepare(
                    "INSERT INTO jobs(id,identifier,customer_id,asset_id,scheduled_date,status,priority,price,address,notes) VALUES(?,?,?,?,?,'confirmed','normal',?,?,?)"
                ).run(jobId, jobNum, est.customer_id, est.asset_id, new Date().toISOString().slice(0, 10), chosen.totalCents / 100, cust.address || "", `${est.title} (${d.chosenTier.toUpperCase()} option accepted by ${d.acceptedBy})`);
            }

            let invoiceId = est.invoice_id;
            if (d.createInvoice && !invoiceId) {
                invoiceId = randomUUID();
                const invNum = "INV-R" + String(Date.now()).slice(-6);
                db.prepare(
                    "INSERT INTO invoices(id,identifier,customer_id,job_id,status,subtotal,tax_amount,total,due_date,notes) VALUES(?,?,?,?,'sent',?,?,?,?,?)"
                ).run(invoiceId, invNum, est.customer_id, jobId, chosen.subtotalCents / 100, chosen.taxCents / 100, chosen.totalCents / 100, new Date().toISOString().slice(0, 10), `Residential ${d.chosenTier} option: ${chosen.label}`);
            }

            db.prepare(
                "UPDATE _res_estimates SET chosen_tier=?,accepted_total_cents=?,accepted_by=?,accepted_at=CURRENT_TIMESTAMP,job_id=?,invoice_id=?,status='converted',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?"
            ).run(d.chosenTier, chosen.totalCents, d.acceptedBy, jobId, invoiceId, estimateId);

            const res = { estimate: listEstimates(user).find((e) => e.id === estimateId), jobId, invoiceId };
            ack(d.requestKey, user, fp, res);
            return res;
        });
    }

    // RES-003: Call booking with duplicate guard & dispatch handoff
    const listBookings = (user) => {
        requireReader(user);
        return db.prepare(
            `SELECT b.id,b.customer_id AS customerId,c.name AS customerName,b.site_id AS siteId,b.asset_id AS assetId,
                    b.channel,b.issue,b.urgency,b.preferred_date AS preferredDate,b.preferred_window AS preferredWindow,
                    b.escalated,b.status,b.job_id AS jobId,b.created_by AS createdBy,b.created_at AS createdAt
             FROM _res_bookings b JOIN customers c ON c.id=b.customer_id ORDER BY b.created_at DESC`
        ).all().map((r) => ({ ...r, escalated: r.escalated === 1 }));
    };

    function createBooking(user, raw) {
        requireWriter(user);
        const d = parse(bookingInput, raw);
        const fp = hash({ action: "create_res_booking", ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fp); if (prior) return prior;
            checkCustomer(d.customerId);
            const dup = db.prepare(
                "SELECT id FROM _res_bookings WHERE customer_id=? AND preferred_date=? AND lower(issue)=lower(?) AND status IN ('new','escalated')"
            ).get(d.customerId, d.preferredDate, d.issue);
            if (dup) fail("An open booking for this customer, date, and issue already exists.", 409);
            const escalated = d.urgency === "emergency" || d.channel === "after_hours";
            const id = d.id || randomUUID();
            db.prepare(
                `INSERT INTO _res_bookings(id,customer_id,site_id,asset_id,channel,issue,urgency,preferred_date,preferred_window,escalated,status,created_by)
                 VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
            ).run(id, d.customerId, d.siteId, d.assetId, d.channel, d.issue, d.urgency, d.preferredDate, d.preferredWindow, Number(escalated), escalated ? "escalated" : "new", user.id);
            const res = { booking: listBookings(user).find((b) => b.id === id) };
            ack(d.requestKey, user, fp, res);
            return res;
        });
    }

    function dispatchBooking(user, bookingId, raw) {
        requireWriter(user);
        parse(uuid, bookingId);
        const d = parse(dispatchBookingInput, raw);
        const fp = hash({ action: "dispatch_res_booking", bookingId, ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fp); if (prior) return prior;
            const b = db.prepare("SELECT * FROM _res_bookings WHERE id=?").get(bookingId);
            if (!b) fail("Booking not found.", 404);
            if (b.status === "dispatched" && b.job_id) fail("Booking has already been dispatched.", 409);
            const cust = checkCustomer(b.customer_id);
            const jobId = randomUUID();
            const jobNum = "RES-" + String(Date.now()).slice(-6);
            const priority = b.urgency === "emergency" ? "urgent" : b.urgency;
            db.prepare(
                "INSERT INTO jobs(id,identifier,customer_id,technician_id,asset_id,scheduled_date,scheduled_time,status,priority,address,notes) VALUES(?,?,?,?,?,?,?,'confirmed',?,?,?)"
            ).run(jobId, jobNum, b.customer_id, d.technicianId, b.asset_id, d.scheduledDate || b.preferred_date, d.scheduledTime, priority, cust.address || "", `[${b.channel}] ${b.issue}`);
            db.prepare("UPDATE _res_bookings SET status='dispatched',job_id=? WHERE id=?").run(jobId, bookingId);
            const res = { booking: listBookings(user).find((x) => x.id === bookingId), jobId };
            ack(d.requestKey, user, fp, res);
            return res;
        });
    }

    // RES-004: Technician mobile job packet
    function mobilePacket(user, jobId) {
        requireReader(user);
        parse(uuid, jobId);
        const job = db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId);
        if (!job) fail("Job not found.", 404);
        const customer = db.prepare("SELECT id,name,phone,email,address,city,state,zip FROM customers WHERE id=?").get(job.customer_id);
        const assets = db.prepare("SELECT id,name,manufacturer,model,serial_number AS serialNumber,status FROM assets WHERE customer_id=? ORDER BY name LIMIT 25").all(job.customer_id);
        const memberships = db.prepare("SELECT id,plan_name AS planName,status,discount_bps AS discountBps,renewal_date AS renewalDate FROM _res_memberships WHERE customer_id=?").all(job.customer_id);
        const estimates = db.prepare("SELECT id,title,status,chosen_tier AS chosenTier,accepted_total_cents AS acceptedTotalCents FROM _res_estimates WHERE customer_id=? ORDER BY created_at DESC LIMIT 10").all(job.customer_id);
        const invoices = db.prepare("SELECT id,identifier,status,total,due_date AS dueDate FROM invoices WHERE job_id=? ORDER BY created_at DESC").all(jobId);
        return { job, customer, assets, memberships, estimates, invoices, generatedAt: new Date().toISOString() };
    }

    // RES-005: Adaptive dispatch suggestions (requires explicit dispatcher approval)
    function adaptiveDispatch(user) {
        requireReader(user);
        const urgentBookings = db.prepare(
            "SELECT b.id,b.issue,b.urgency,b.preferred_date AS preferredDate,c.name AS customerName FROM _res_bookings b JOIN customers c ON c.id=b.customer_id WHERE b.status IN ('new','escalated') ORDER BY CASE b.urgency WHEN 'emergency' THEN 0 WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,b.preferred_date LIMIT 20"
        ).all();
        const activeTechs = db.prepare("SELECT id,name FROM technicians WHERE active=1 ORDER BY name").all();
        const suggestions = urgentBookings.map((b, idx) => ({
            bookingId: b.id,
            customerName: b.customerName,
            urgency: b.urgency,
            preferredDate: b.preferredDate,
            issue: b.issue,
            recommendedTechnician: activeTechs.length ? activeTechs[idx % activeTechs.length] : null,
            requiresDispatcherApproval: true,
            reason: b.urgency === "emergency" || b.urgency === "urgent" ? "High-urgency residential intake awaiting dispatch slot" : "Open booking ready for assignment",
        }));
        return { generatedAt: new Date().toISOString(), requiresDispatcherApproval: true, suggestions };
    }

    // RES-007: Field payment intents & external financing referrals
    const listPayments = (user) => {
        requireReader(user);
        return db.prepare(
            `SELECT p.id,p.invoice_id AS invoiceId,i.identifier AS invoiceIdentifier,p.customer_id AS customerId,
                    c.name AS customerName,p.provider,p.provider_token_ref AS providerTokenRef,
                    p.amount_cents AS amountCents,p.status,p.notes,p.actor_id AS actorId,p.created_at AS createdAt
             FROM _res_payment_intents p
             JOIN invoices i ON i.id=p.invoice_id
             JOIN customers c ON c.id=p.customer_id
             ORDER BY p.created_at DESC LIMIT 100`
        ).all().map((r) => ({ ...r }));
    };

    function recordPaymentIntent(user, raw) {
        requireWriter(user);
        const d = parse(paymentIntentInput, raw);
        const fp = hash({ action: "res_payment_intent", ...d });
        return transaction(db, () => {
            const prior = replay(user, d.requestKey, fp); if (prior) return prior;
            const inv = db.prepare("SELECT id,customer_id,total,status FROM invoices WHERE id=?").get(d.invoiceId);
            if (!inv) fail("Invoice not found.", 404);
            const id = randomUUID();
            db.prepare(
                "INSERT INTO _res_payment_intents(id,request_key,invoice_id,customer_id,provider,provider_token_ref,amount_cents,status,notes,actor_id) VALUES(?,?,?,?,?,?,?,?,?,?)"
            ).run(id, d.requestKey, inv.id, inv.customer_id, d.provider, d.providerTokenRef, d.amountCents, d.status, d.notes, user.id);
            if (d.status === "succeeded" && d.amountCents >= Math.round(inv.total * 100)) {
                db.prepare("UPDATE invoices SET status='paid' WHERE id=?").run(inv.id);
            }
            const res = { payment: listPayments(user).find((p) => p.id === id) };
            ack(d.requestKey, user, fp, res);
            return res;
        });
    }

    const listFinancing = (user) => {
        requireReader(user);
        return db.prepare(
            `SELECT f.id,f.customer_id AS customerId,c.name AS customerName,f.estimate_id AS estimateId,
                    f.provider_name AS providerName,f.requested_cents AS requestedCents,
                    f.external_ref AS externalRef,f.status,f.created_at AS createdAt
             FROM _res_financing_referrals f JOIN customers c ON c.id=f.customer_id ORDER BY f.created_at DESC LIMIT 100`
        ).all();
    };

    function createFinancingReferral(user, raw) {
        requireWriter(user);
        const d = parse(financingInput, raw);
        checkCustomer(d.customerId);
        const id = randomUUID();
        db.prepare(
            "INSERT INTO _res_financing_referrals(id,customer_id,estimate_id,provider_name,requested_cents,external_ref,status,actor_id) VALUES(?,?,?,?,?,?,'referred',?)"
        ).run(id, d.customerId, d.estimateId, d.providerName, d.requestedCents, d.externalRef, user.id);
        return { referral: listFinancing(user).find((r) => r.id === id) };
    }

    // RES-006 & RES-008: Residential reporting & accounting/payroll handoff readiness
    function overview(user) {
        requireReader(user);
        const plans = listPlans(user);
        const memberships = listMemberships(user);
        const pricebook = listPricebook(user);
        const estimates = listEstimates(user);
        const bookings = listBookings(user);
        const payments = listPayments(user);
        const financing = listFinancing(user);
        const adaptive = adaptiveDispatch(user);

        const convertedCount = estimates.filter((e) => e.status === "converted" || e.status === "accepted").length;
        const conversionRatePct = estimates.length ? Math.round((convertedCount / estimates.length) * 1000) / 10 : 0;
        const collectedCents = payments.filter((p) => p.status === "succeeded" || p.status === "partially_paid").reduce((s, p) => s + p.amountCents, 0);

        return {
            computedAt: new Date().toISOString(),
            kpis: {
                activeMemberships: memberships.filter((m) => m.status === "active").length,
                openBookings: bookings.filter((b) => ["new", "escalated"].includes(b.status)).length,
                estimatesTotal: estimates.length,
                estimateConversionPct: conversionRatePct,
                fieldCollectedCents: collectedCents,
            },
            handoffNote: "Accounting & payroll handoff exports approved operational records; exporting time or payments is not proof that QuickBooks posting or payroll filing occurred.",
            plans, memberships, pricebook, estimates, bookings, payments, financing, adaptive,
        };
    }

    return {
        overview,
        listPlans, savePlan, listMemberships, enrollMembership, updateMembershipStatus,
        listPricebook, savePricebookItem, listEstimates, createEstimate, acceptEstimate,
        listBookings, createBooking, dispatchBooking,
        mobilePacket, adaptiveDispatch,
        listPayments, recordPaymentIntent, listFinancing, createFinancingReferral,
    };
}
