import { randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "../platform/sqlite.mjs";
import { audit } from "./storage.mjs";
import { SalesError, requireWriter, parse, date, version } from "./domain.mjs";

export const CAMPAIGN_CHANNELS = [
  "google_ads",
  "local_service_ads",
  "meta_ads",
  "website_seo",
  "direct_mail",
  "yard_sign",
  "referral",
  "other",
];

export const campaignSchema = `
CREATE TABLE _sales_campaigns(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('google_ads','local_service_ads','meta_ads','website_seo','direct_mail','yard_sign','referral','other')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','archived')),
  tracking_code TEXT NOT NULL DEFAULT '',
  budget_cents INTEGER NOT NULL DEFAULT 0 CHECK(budget_cents >= 0),
  spend_cents INTEGER NOT NULL DEFAULT 0 CHECK(spend_cents >= 0),
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _sales_campaigns_status ON _sales_campaigns(status, channel, created_at);
CREATE TABLE _sales_attributions(
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('opportunity','customer','job','booking')),
  entity_id TEXT NOT NULL,
  campaign_id TEXT REFERENCES _sales_campaigns(id) ON DELETE SET NULL,
  referral_channel TEXT NOT NULL DEFAULT '',
  referred_by_customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  referred_by_name TEXT NOT NULL DEFAULT '',
  utm_source TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entity_type, entity_id)
);
CREATE INDEX _sales_attributions_campaign ON _sales_attributions(campaign_id, entity_type);
CREATE INDEX _sales_attributions_channel ON _sales_attributions(referral_channel, created_at);
ALTER TABLE _sales_opportunities ADD COLUMN campaign_id TEXT REFERENCES _sales_campaigns(id) ON DELETE SET NULL;
ALTER TABLE _sales_opportunities ADD COLUMN referred_by_name TEXT NOT NULL DEFAULT '';
`;

const text = (max) => z.string().trim().max(max);

const campaignInput = z
  .object({
    name: text(140).min(1, "Enter a campaign name."),
    channel: z.enum(CAMPAIGN_CHANNELS),
    status: z.enum(["active", "paused", "archived"]).default("active"),
    trackingCode: text(120).default(""),
    budgetCents: z.number().int().min(0).max(1_000_000_000).default(0),
    spendCents: z.number().int().min(0).max(1_000_000_000).default(0),
    startDate: date.default(""),
    endDate: date.default(""),
    notes: text(4000).default(""),
    expectedVersion: version.optional(),
  })
  .strict()
  .refine(
    (d) => !d.startDate || !d.endDate || d.endDate >= d.startDate,
    "End date must be on or after start date.",
  );

const attributionInput = z
  .object({
    entityType: z.enum(["opportunity", "customer", "job", "booking"]),
    entityId: z.string().min(1).max(100),
    campaignId: z.string().uuid().nullable().optional().default(null),
    referralChannel: text(80).default(""),
    referredByCustomerId: z.string().uuid().nullable().optional().default(null),
    referredByName: text(200).default(""),
    utmSource: text(120).default(""),
    utmCampaign: text(120).default(""),
    notes: text(1000).default(""),
  })
  .strict();

function tableExists(db, name) {
  return Boolean(
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(name),
  );
}

export function createCampaigns({ storage }) {
  const db = storage.database;

  function computeCampaignMetrics(campaignId, from = "", to = "") {
    const dateFilterOpp =
      (from ? " AND substr(o.created_at,1,10) >= ?" : "") +
      (to ? " AND substr(o.created_at,1,10) <= ?" : "");
    const dateParams = [
      ...(from ? [from] : []),
      ...(to ? [to] : []),
    ];

    const opps = db
      .prepare(
        `SELECT o.id, o.title, o.expected_value, o.customer_id, s.kind AS stage_kind, o.created_at
         FROM _sales_opportunities o
         JOIN _sales_stages s ON s.id = o.stage_id
         LEFT JOIN _sales_attributions a ON a.entity_type = 'opportunity' AND a.entity_id = o.id
         WHERE (o.campaign_id = ? OR a.campaign_id = ?)${dateFilterOpp}`,
      )
      .all(campaignId, campaignId, ...dateParams);

    const oppIds = new Set(opps.map((o) => o.id));
    const attrCustomers = db
      .prepare(
        `SELECT entity_id FROM _sales_attributions
         WHERE campaign_id = ? AND entity_type = 'customer'` +
          (from ? " AND substr(created_at,1,10) >= ?" : "") +
          (to ? " AND substr(created_at,1,10) <= ?" : ""),
      )
      .all(campaignId, ...dateParams)
      .map((r) => r.entity_id);

    const attrJobs = db
      .prepare(
        `SELECT entity_id FROM _sales_attributions
         WHERE campaign_id = ? AND entity_type = 'job'` +
          (from ? " AND substr(created_at,1,10) >= ?" : "") +
          (to ? " AND substr(created_at,1,10) <= ?" : ""),
      )
      .all(campaignId, ...dateParams)
      .map((r) => r.entity_id);

    // Also include jobs converted from attributed opportunities
    const jobIds = new Set(attrJobs);
    if (oppIds.size > 0 && tableExists(db, "_sales_quote_conversions")) {
      for (const oppId of oppIds) {
        const convRows = db
          .prepare(
            `SELECT c.job_id FROM _sales_quote_conversions c
             JOIN _sales_quotes q ON q.id = c.quote_id
             WHERE q.opportunity_id = ? AND c.job_id IS NOT NULL`,
          )
          .all(oppId);
        for (const r of convRows) jobIds.add(r.job_id);
      }
    }

    // Quotes associated with attributed opportunities
    let quotesSent = 0;
    let quotesAccepted = 0;
    if (oppIds.size > 0 && tableExists(db, "_sales_quotes")) {
      const hasLifecycle = tableExists(db, "_sales_quote_lifecycle");
      for (const oppId of oppIds) {
        const qs = db
          .prepare("SELECT id FROM _sales_quotes WHERE opportunity_id = ?")
          .all(oppId);
        for (const q of qs) {
          if (hasLifecycle) {
            const evs = db
              .prepare(
                "SELECT event_type FROM _sales_quote_lifecycle WHERE quote_id = ?",
              )
              .all(q.id)
              .map((e) => e.event_type);
            if (evs.includes("offered") || evs.includes("delivered")) quotesSent += 1;
            if (evs.includes("accepted")) quotesAccepted += 1;
          }
        }
      }
    }

    // Revenue from invoices on attributed jobs (in cents; invoices.total is dollars float)
    let invoicedRevenueCents = 0;
    if (jobIds.size > 0 && tableExists(db, "invoices")) {
      const idList = [...jobIds];
      const placeholders = idList.map(() => "?").join(",");
      const inv = db
        .prepare(
          `SELECT COALESCE(SUM(total), 0) AS total
           FROM invoices
           WHERE job_id IN (${placeholders}) AND status != 'void'`,
        )
        .get(...idList);
      invoicedRevenueCents = Math.round(Number(inv?.total || 0) * 100);
    }

    const wonOpps = opps.filter((o) => o.stage_kind === "won");
    const wonValueCents = wonOpps.reduce((s, o) => s + Number(o.expected_value || 0), 0);
    const pipelineValueCents = opps
      .filter((o) => o.stage_kind === "open")
      .reduce((s, o) => s + Number(o.expected_value || 0), 0);

    // Distinct leads = attributed opportunities + direct attributed jobs/customers not already counted via an opportunity
    const leadsCount = Math.max(opps.length, 0) + attrJobs.length + attrCustomers.length;
    const bookedJobsCount = jobIds.size;
    const recognizedRevenueCents = Math.max(invoicedRevenueCents, wonValueCents);

    return {
      leadsCount,
      opportunitiesCount: opps.length,
      wonCount: wonOpps.length,
      bookedJobsCount,
      quotesSent,
      quotesAccepted,
      pipelineValueCents,
      wonValueCents,
      invoicedRevenueCents,
      recognizedRevenueCents,
      conversionRatePct:
        leadsCount > 0 ? Math.round(((wonOpps.length + bookedJobsCount) / leadsCount) * 1000) / 10 : 0,
    };
  }

  function enrichCampaign(row, from = "", to = "") {
    const m = computeCampaignMetrics(row.id, from, to);
    const spend = Number(row.spend_cents || 0);
    const costPerLeadCents = m.leadsCount > 0 ? Math.round(spend / m.leadsCount) : null;
    const costPerJobCents = m.bookedJobsCount > 0 ? Math.round(spend / m.bookedJobsCount) : null;
    const roas = spend > 0 ? Math.round((m.recognizedRevenueCents / spend) * 100) / 100 : null;
    const roiPct =
      spend > 0 ? Math.round(((m.recognizedRevenueCents - spend) / spend) * 1000) / 10 : null;
    return {
      id: row.id,
      name: row.name,
      channel: row.channel,
      status: row.status,
      trackingCode: row.tracking_code,
      budgetCents: row.budget_cents,
      spendCents: row.spend_cents,
      startDate: row.start_date,
      endDate: row.end_date,
      notes: row.notes,
      version: row.version,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metrics: {
        ...m,
        costPerLeadCents,
        costPerJobCents,
        roas,
        roiPct,
      },
    };
  }

  function list(query = {}) {
    const where = [];
    const params = [];
    if (query.status && ["active", "paused", "archived"].includes(query.status)) {
      where.push("status = ?");
      params.push(query.status);
    }
    if (query.channel && CAMPAIGN_CHANNELS.includes(query.channel)) {
      where.push("channel = ?");
      params.push(query.channel);
    }
    if (query.search) {
      where.push("(lower(name) LIKE ? OR lower(tracking_code) LIKE ?)");
      const q = `%${String(query.search).toLowerCase()}%`;
      params.push(q, q);
    }
    const from = typeof query.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.from) ? query.from : "";
    const to = typeof query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.to) ? query.to : "";
    const sql =
      "SELECT * FROM _sales_campaigns" +
      (where.length ? " WHERE " + where.join(" AND ") : "") +
      " ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, created_at DESC";
    const rows = db.prepare(sql).all(...params);
    return {
      campaigns: rows.map((r) => enrichCampaign(r, from, to)),
      channels: CAMPAIGN_CHANNELS,
      filters: { from, to, status: query.status || "all", channel: query.channel || "all" },
    };
  }

  function save(user, id, input) {
    requireWriter(user);
    const data = parse(campaignInput, input);
    return transaction(db, () => {
      const old = id
        ? db.prepare("SELECT * FROM _sales_campaigns WHERE id = ?").get(id)
        : null;
      if (id && !old) throw new SalesError("Campaign not found.", 404);
      if (old && data.expectedVersion !== undefined && data.expectedVersion !== old.version) {
        throw new SalesError("This campaign changed in another session. Reload before saving.", 409);
      }
      const campaignId = id || randomUUID();
      if (old) {
        db.prepare(
          `UPDATE _sales_campaigns
           SET name=?, channel=?, status=?, tracking_code=?, budget_cents=?, spend_cents=?,
               start_date=?, end_date=?, notes=?, version=version+1, updated_at=CURRENT_TIMESTAMP
           WHERE id=?`,
        ).run(
          data.name,
          data.channel,
          data.status,
          data.trackingCode,
          data.budgetCents,
          data.spendCents,
          data.startDate,
          data.endDate,
          data.notes,
          campaignId,
        );
      } else {
        db.prepare(
          `INSERT INTO _sales_campaigns(id, name, channel, status, tracking_code, budget_cents, spend_cents, start_date, end_date, notes, created_by)
           VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        ).run(
          campaignId,
          data.name,
          data.channel,
          data.status,
          data.trackingCode,
          data.budgetCents,
          data.spendCents,
          data.startDate,
          data.endDate,
          data.notes,
          user.id,
        );
      }
      const saved = db.prepare("SELECT * FROM _sales_campaigns WHERE id = ?").get(campaignId);
      audit(db, user, "campaign", campaignId, old ? "update" : "create", old ?? null, saved);
      return { campaign: enrichCampaign(saved) };
    });
  }

  function detail(id, query = {}) {
    const row = db.prepare("SELECT * FROM _sales_campaigns WHERE id = ?").get(id);
    if (!row) throw new SalesError("Campaign not found.", 404);
    const from = typeof query.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.from) ? query.from : "";
    const to = typeof query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.to) ? query.to : "";
    const campaign = enrichCampaign(row, from, to);

    const opportunities = db
      .prepare(
        `SELECT o.id, o.title, o.prospect_name, c.name AS customer_name, s.name AS stage_name,
                s.kind AS stage_kind, o.expected_value, o.source, o.referred_by_name, o.created_at
         FROM _sales_opportunities o
         JOIN _sales_stages s ON s.id = o.stage_id
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN _sales_attributions a ON a.entity_type = 'opportunity' AND a.entity_id = o.id
         WHERE o.campaign_id = ? OR a.campaign_id = ?
         ORDER BY o.created_at DESC LIMIT 100`,
      )
      .all(id, id);

    const jobs = db
      .prepare(
        `SELECT j.id, j.identifier, j.status, j.scheduled_date, c.name AS customer_name,
                a.referral_channel, a.referred_by_name, a.created_at
         FROM _sales_attributions a
         JOIN jobs j ON j.id = a.entity_id
         LEFT JOIN customers c ON c.id = j.customer_id
         WHERE a.entity_type = 'job' AND a.campaign_id = ?
         ORDER BY a.created_at DESC LIMIT 100`,
      )
      .all(id);

    const customers = db
      .prepare(
        `SELECT c.id, c.name, c.phone, c.email, a.referral_channel, a.referred_by_name, a.created_at
         FROM _sales_attributions a
         JOIN customers c ON c.id = a.entity_id
         WHERE a.entity_type = 'customer' AND a.campaign_id = ?
         ORDER BY a.created_at DESC LIMIT 100`,
      )
      .all(id);

    return { campaign, opportunities, jobs, customers };
  }

  function attribute(user, input) {
    requireWriter(user);
    const data = parse(attributionInput, input);
    return transaction(db, () => {
      let channel = data.referralChannel;
      if (data.campaignId) {
        const camp = db
          .prepare("SELECT id, channel FROM _sales_campaigns WHERE id = ?")
          .get(data.campaignId);
        if (!camp) throw new SalesError("Campaign not found.", 404);
        if (!channel) channel = camp.channel;
      }
      if (data.referredByCustomerId) {
        const cust = db
          .prepare("SELECT id, name FROM customers WHERE id = ?")
          .get(data.referredByCustomerId);
        if (!cust) throw new SalesError("Referring customer not found.", 404);
      }
      const existing = db
        .prepare("SELECT id FROM _sales_attributions WHERE entity_type = ? AND entity_id = ?")
        .get(data.entityType, data.entityId);
      const id = existing?.id || randomUUID();
      db.prepare(
        `INSERT INTO _sales_attributions(id, entity_type, entity_id, campaign_id, referral_channel, referred_by_customer_id, referred_by_name, utm_source, utm_campaign, notes, created_by)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(entity_type, entity_id) DO UPDATE SET
           campaign_id = excluded.campaign_id,
           referral_channel = excluded.referral_channel,
           referred_by_customer_id = excluded.referred_by_customer_id,
           referred_by_name = excluded.referred_by_name,
           utm_source = excluded.utm_source,
           utm_campaign = excluded.utm_campaign,
           notes = excluded.notes`,
      ).run(
        id,
        data.entityType,
        data.entityId,
        data.campaignId,
        channel,
        data.referredByCustomerId,
        data.referredByName,
        data.utmSource,
        data.utmCampaign,
        data.notes,
        user.id,
      );
      const saved = db.prepare("SELECT * FROM _sales_attributions WHERE id = ?").get(id);
      audit(db, user, "attribution", id, existing ? "update" : "create", existing ?? null, saved);
      return { attribution: saved };
    });
  }

  function analytics(query = {}) {
    const { campaigns, filters } = list(query);
    const totalSpendCents = campaigns.reduce((s, c) => s + c.spendCents, 0);
    const totalBudgetCents = campaigns.reduce((s, c) => s + c.budgetCents, 0);
    const totalLeads = campaigns.reduce((s, c) => s + c.metrics.leadsCount, 0);
    const totalBookedJobs = campaigns.reduce((s, c) => s + c.metrics.bookedJobsCount, 0);
    const totalWonCount = campaigns.reduce((s, c) => s + c.metrics.wonCount, 0);
    const totalPipelineValueCents = campaigns.reduce((s, c) => s + c.metrics.pipelineValueCents, 0);
    const totalRevenueCents = campaigns.reduce((s, c) => s + c.metrics.recognizedRevenueCents, 0);

    // Channel breakdown (combines campaign channels + direct opportunity sources/attributions)
    const byChannel = new Map();
    for (const c of campaigns) {
      const cur = byChannel.get(c.channel) || {
        channel: c.channel,
        campaignsCount: 0,
        spendCents: 0,
        leadsCount: 0,
        bookedJobsCount: 0,
        wonCount: 0,
        revenueCents: 0,
      };
      cur.campaignsCount += 1;
      cur.spendCents += c.spendCents;
      cur.leadsCount += c.metrics.leadsCount;
      cur.bookedJobsCount += c.metrics.bookedJobsCount;
      cur.wonCount += c.metrics.wonCount;
      cur.revenueCents += c.metrics.recognizedRevenueCents;
      byChannel.set(c.channel, cur);
    }

    // Also include referral sources from opportunities without a campaign_id so organic referrals show up!
    const uncampOpps = db
      .prepare(
        `SELECT COALESCE(NULLIF(trim(o.source), ''), 'direct') AS source,
                COUNT(*) AS cnt,
                SUM(CASE WHEN s.kind = 'won' THEN 1 ELSE 0 END) AS won_cnt,
                SUM(CASE WHEN s.kind = 'won' THEN o.expected_value ELSE 0 END) AS won_val
         FROM _sales_opportunities o
         JOIN _sales_stages s ON s.id = o.stage_id
         WHERE o.campaign_id IS NULL
         GROUP BY COALESCE(NULLIF(trim(o.source), ''), 'direct')`,
      )
      .all();

    const referralSources = uncampOpps.map((r) => ({
      source: r.source,
      leadsCount: r.cnt,
      wonCount: r.won_cnt,
      revenueCents: r.won_val || 0,
    }));

    return {
      filters,
      summary: {
        activeCampaigns: campaigns.filter((c) => c.status === "active").length,
        totalCampaigns: campaigns.length,
        totalBudgetCents,
        totalSpendCents,
        totalLeads,
        totalBookedJobs,
        totalWonCount,
        totalPipelineValueCents,
        totalRevenueCents,
        blendedCplCents: totalLeads > 0 ? Math.round(totalSpendCents / totalLeads) : null,
        blendedCpaCents: totalBookedJobs > 0 ? Math.round(totalSpendCents / totalBookedJobs) : null,
        blendedRoas:
          totalSpendCents > 0 ? Math.round((totalRevenueCents / totalSpendCents) * 100) / 100 : null,
      },
      byChannel: [...byChannel.values()].sort((a, b) => b.revenueCents - a.revenueCents || b.leadsCount - a.leadsCount),
      referralSources,
      campaigns,
    };
  }

  return { list, save, detail, attribute, analytics };
}
