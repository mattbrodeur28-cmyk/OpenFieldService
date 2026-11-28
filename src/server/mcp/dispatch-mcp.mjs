import { randomBytes, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { migrate, transaction } from "../platform/sqlite.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const mcpSchema = `
CREATE TABLE _mcp_api_keys(
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE _dispatch_ai_alerts(
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  job_identifier TEXT NOT NULL,
  booking_id TEXT,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL DEFAULT '',
  customer_email TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL DEFAULT 'website_ai',
  urgency TEXT NOT NULL DEFAULT 'normal',
  preferred_date TEXT NOT NULL DEFAULT '',
  preferred_window TEXT NOT NULL DEFAULT 'morning',
  issue TEXT NOT NULL,
  conversation_summary TEXT NOT NULL DEFAULT '',
  source_reference TEXT NOT NULL DEFAULT '',
  campaign_id TEXT,
  referred_by_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending_confirmation' CHECK(status IN ('pending_confirmation','confirmed','dismissed')),
  team_message_id TEXT,
  confirmed_by TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _dispatch_ai_alerts_status ON _dispatch_ai_alerts(status, created_at);
`;

const TOOLS = [
  {
    name: "dispatch_check_availability",
    description:
      "Check technician availability and open arrival windows for a given date (YYYY-MM-DD) before offering a booking slot to a customer.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Target service date in YYYY-MM-DD format." },
        duration_minutes: { type: "integer", description: "Estimated job duration in minutes (default 60)." },
      },
      required: ["date"],
    },
  },
  {
    name: "dispatch_lookup_customer",
    description:
      "Search existing customers by email, phone number, or name so returning callers/emailers are linked to their existing account.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Customer email, phone number, or name to search." },
      },
      required: ["query"],
    },
  },
  {
    name: "dispatch_list_campaigns",
    description:
      "List active Sales ad campaigns and referral channels so the AI can attribute inbound website/email leads accurately.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "dispatch_book_call",
    description:
      "Automatically book a service call from a website chat or email inquiry. Creates/links the customer, places an unassigned job in the Dispatcher Work Pipeline, attributes the ad campaign/referral source if provided, and alerts the Manager/Owner to confirm.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string", description: "Existing customer UUID if already found via dispatch_lookup_customer." },
        customer_name: { type: "string", description: "Full name or company name (required when customer_id is omitted)." },
        customer_type: { type: "string", enum: ["residential", "commercial"], description: "Customer type (default residential)." },
        phone: { type: "string", description: "Customer phone number." },
        email: { type: "string", description: "Customer email address." },
        address: { type: "string", description: "Service street address." },
        issue: { type: "string", description: "Clear description of the service issue." },
        channel: {
          type: "string",
          enum: ["website_ai", "email_ai", "phone", "after_hours"],
          description: "Inbound channel (default website_ai).",
        },
        urgency: {
          type: "string",
          enum: ["normal", "high", "urgent", "emergency"],
          description: "Urgency level (default normal).",
        },
        preferred_date: { type: "string", description: "Requested date in YYYY-MM-DD format (defaults to today)." },
        preferred_window: {
          type: "string",
          enum: ["morning", "afternoon", "anytime"],
          description: "Requested arrival window (default morning).",
        },
        preferred_time: { type: "string", description: "Optional HH:MM time (24h). Defaults to 09:00 for morning / 13:00 for afternoon." },
        campaign_id: { type: "string", description: "Optional Sales ad campaign UUID for attribution." },
        referral_channel: { type: "string", description: "Optional referral channel (e.g. google_ads, website_seo, referral)." },
        referred_by_name: { type: "string", description: "Optional name of referring person/company." },
        conversation_summary: { type: "string", description: "Short summary of the website chat or email thread for the manager." },
        source_reference: { type: "string", description: "Optional email subject, message ID, or chat session ID." },
      },
      required: ["issue"],
    },
  },
  {
    name: "dispatch_list_pending_confirmations",
    description: "List AI-booked service calls that are still waiting for Manager or Owner confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending_confirmation", "confirmed", "dismissed", "all"],
          description: "Filter alerts by status (default pending_confirmation).",
        },
      },
    },
  },
  {
    name: "dispatch_confirm_booking",
    description:
      "Confirm an AI-booked service call (marking it Dispatched/confirmed and optionally assigning a technician).",
    inputSchema: {
      type: "object",
      properties: {
        alert_id: { type: "string", description: "The AI alert ID from dispatch_book_call or dispatch_list_pending_confirmations." },
        technician_id: { type: "string", description: "Optional technician UUID to assign." },
        scheduled_date: { type: "string", description: "Optional updated YYYY-MM-DD date." },
        scheduled_time: { type: "string", description: "Optional updated HH:MM time." },
      },
      required: ["alert_id"],
    },
  },
];

export function createDispatchMcp({
  storage,
  currentUser,
  postManagerAlert,
  env = process.env,
}) {
  const db = storage.database;
  migrate(db, "_mcp_schema_migrations", [{ version: 1, sql: mcpSchema }]);

  function safeCompare(a, b) {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  }

  function authenticateMcp(c) {
    // 1. Check Bearer token or X-API-Key header
    const authHeader = c.req.header("Authorization") || "";
    const bearer = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    const apiKey = bearer || (c.req.header("X-API-Key") || "").trim();

    if (apiKey) {
      const envKey = (env.OFS_MCP_API_KEY || "").trim();
      if (envKey && safeCompare(apiKey, envKey)) {
        return { id: "mcp-env", name: "AI Dispatch Agent", role: "admin", active: true };
      }
      const keyHash = sha256(apiKey);
      const row = db
        .prepare("SELECT * FROM _mcp_api_keys WHERE key_hash = ? AND revoked_at IS NULL")
        .get(keyHash);
      if (row) {
        db.prepare("UPDATE _mcp_api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id);
        return { id: `mcp:${row.id}`, name: row.label, role: "admin", active: true };
      }
      return null;
    }

    // 2. Fall back to authenticated Owner/Admin staff session
    const user = currentUser ? currentUser(c) : null;
    if (user?.active && !user.mustChangePassword && ["owner", "admin"].includes(user.role)) {
      return user;
    }
    return null;
  }

  // ---- Tool Implementations ----
  function checkAvailability(args = {}) {
    const date = typeof args.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.date)
      ? args.date
      : new Date().toISOString().slice(0, 10);
    const duration = Number.isInteger(args.duration_minutes) && args.duration_minutes >= 15
      ? Math.min(args.duration_minutes, 480)
      : 60;

    const techs = db
      .prepare("SELECT id, name, active FROM technicians WHERE active = 1 ORDER BY name")
      .all();
    const booked = db
      .prepare(
        `SELECT id, identifier, technician_id, scheduled_time, COALESCE(duration, 60) AS duration, status
         FROM jobs
         WHERE scheduled_date = ? AND status NOT IN ('cancelled', 'completed')`,
      )
      .all(date);

    const morningCount = booked.filter((j) => (j.scheduled_time || "09:00") < "12:00").length;
    const afternoonCount = booked.filter((j) => (j.scheduled_time || "09:00") >= "12:00").length;
    const capacity = Math.max(techs.length * 2, 2);

    return {
      date,
      duration_minutes: duration,
      active_technicians: techs.map((t) => ({ id: t.id, name: t.name })),
      booked_jobs_count: booked.length,
      windows: [
        {
          window: "morning",
          label: "Morning (8:00 AM – 12:00 PM)",
          default_time: "09:00",
          booked_count: morningCount,
          available: morningCount < capacity,
        },
        {
          window: "afternoon",
          label: "Afternoon (12:00 PM – 5:00 PM)",
          default_time: "13:00",
          booked_count: afternoonCount,
          available: afternoonCount < capacity,
        },
      ],
      note: "Bookings made by AI are placed in the Dispatcher Work Pipeline and require Manager/Owner confirmation.",
    };
  }

  function lookupCustomer(args = {}) {
    const q = String(args.query || "").trim();
    if (!q) throw new Error("Provide a search query (email, phone, or name).");
    const like = `%${q.toLowerCase()}%`;
    const rows = db
      .prepare(
        `SELECT id, name, customer_type, phone, email, address, city, state, zip
         FROM customers
         WHERE lower(name) LIKE ? OR lower(COALESCE(email,'')) LIKE ? OR lower(COALESCE(phone,'')) LIKE ?
         ORDER BY name LIMIT 15`,
      )
      .all(like, like, like);
    return { count: rows.length, customers: rows };
  }

  function listCampaigns() {
    const hasTable = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_sales_campaigns'")
      .get();
    if (!hasTable) return { campaigns: [] };
    const rows = db
      .prepare(
        "SELECT id, name, channel, tracking_code AS trackingCode, status FROM _sales_campaigns WHERE status = 'active' ORDER BY name",
      )
      .all();
    return { campaigns: rows };
  }

  function bookCall(actor, args = {}) {
    const issue = String(args.issue || "").trim();
    if (!issue) throw new Error("issue is required.");
    const channel = ["website_ai", "email_ai", "phone", "after_hours"].includes(args.channel)
      ? args.channel
      : "website_ai";
    const urgency = ["normal", "high", "urgent", "emergency"].includes(args.urgency)
      ? args.urgency
      : "normal";
    const preferredDate =
      typeof args.preferred_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.preferred_date)
        ? args.preferred_date
        : new Date().toISOString().slice(0, 10);
    const preferredWindow = ["morning", "afternoon", "anytime"].includes(args.preferred_window)
      ? args.preferred_window
      : "morning";
    const scheduledTime =
      typeof args.preferred_time === "string" && /^\d{2}:\d{2}$/.test(args.preferred_time)
        ? args.preferred_time
        : preferredWindow === "afternoon"
          ? "13:00"
          : "09:00";

    const result = transaction(db, () => {
      // 1. Resolve or create customer (matching email/phone first to avoid duplicates)
      let customer = null;
      if (args.customer_id) {
        customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(args.customer_id);
        if (!customer) throw new Error("Specified customer_id not found.");
      }
      if (!customer && args.email) {
        customer = db
          .prepare("SELECT * FROM customers WHERE lower(email) = lower(?) LIMIT 1")
          .get(String(args.email).trim());
      }
      if (!customer && args.phone) {
        const cleanPhone = String(args.phone).replace(/\D/g, "");
        if (cleanPhone.length >= 7) {
          const candidates = db.prepare("SELECT * FROM customers WHERE phone IS NOT NULL AND phone != ''").all();
          customer = candidates.find((c) => String(c.phone || "").replace(/\D/g, "") === cleanPhone) || null;
        }
      }
      if (!customer) {
        const name = String(args.customer_name || "").trim();
        if (!name) throw new Error("customer_name is required when no existing customer matches.");
        const custId = randomUUID();
        const custType = args.customer_type === "commercial" ? "commercial" : "residential";
        db.prepare(
          "INSERT INTO customers(id, name, customer_type, phone, email, address) VALUES(?,?,?,?,?,?)",
        ).run(
          custId,
          name,
          custType,
          String(args.phone || "").trim(),
          String(args.email || "").trim(),
          String(args.address || "").trim(),
        );
        customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(custId);
      }

      // 2. Create residential booking record if table exists
      const bookingId = randomUUID();
      const hasResBookings = db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_res_bookings'")
        .get();
      const bookingChannel = channel === "after_hours" ? "after_hours" : "ai_assisted";
      if (hasResBookings) {
        db.prepare(
          `INSERT INTO _res_bookings(id, customer_id, site_id, asset_id, channel, issue, urgency, preferred_date, preferred_window, escalated, status, created_by)
           VALUES(?,?,NULL,NULL,?,?,?,?,?,?,?,?)`,
        ).run(
          bookingId,
          customer.id,
          bookingChannel,
          issue,
          urgency,
          preferredDate,
          preferredWindow,
          urgency === "emergency" || channel === "after_hours" ? 1 : 0,
          "dispatched",
          actor.id,
        );
      }

      // 3. Create unassigned job in Work Pipeline awaiting Manager/Owner confirmation
      const jobId = randomUUID();
      const jobIdentifier = "AI-" + String(Date.now()).slice(-6);
      const priority = urgency === "emergency" ? "urgent" : urgency;
      const summaryLine = args.conversation_summary
        ? `\nAI Summary: ${String(args.conversation_summary).trim()}`
        : "";
      const refLine = args.source_reference
        ? `\nRef: ${String(args.source_reference).trim()}`
        : "";
      const jobNotes = `[${channel} · PENDING CONFIRMATION] ${issue}${summaryLine}${refLine}`;

      db.prepare(
        `INSERT INTO jobs(id, identifier, customer_id, technician_id, scheduled_date, scheduled_time, status, priority, address, notes)
         VALUES(?,?,?,NULL,?,?,'scheduled',?,?,?)`,
      ).run(
        jobId,
        jobIdentifier,
        customer.id,
        preferredDate,
        scheduledTime,
        priority,
        String(args.address || customer.address || "").trim(),
        jobNotes,
      );

      if (hasResBookings) {
        db.prepare("UPDATE _res_bookings SET job_id = ? WHERE id = ?").run(jobId, bookingId);
      }

      // 4. Record campaign/referral attribution if Sales attributions table exists
      const hasAttr = db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_sales_attributions'")
        .get();
      if (hasAttr && (args.campaign_id || args.referral_channel || args.referred_by_name)) {
        const validCamp = args.campaign_id
          ? db.prepare("SELECT id, channel FROM _sales_campaigns WHERE id = ?").get(args.campaign_id)
          : null;
        db.prepare(
          `INSERT OR REPLACE INTO _sales_attributions(id, entity_type, entity_id, campaign_id, referral_channel, referred_by_name, utm_source, notes, created_by)
           VALUES(?,?,?,?,?,?,?,?,?)`,
        ).run(
          randomUUID(),
          "job",
          jobId,
          validCamp?.id || null,
          String(args.referral_channel || validCamp?.channel || channel).trim(),
          String(args.referred_by_name || "").trim(),
          channel,
          String(args.source_reference || "").trim(),
          actor.id,
        );
      }

      // 5. Create Manager/Owner confirmation alert
      const alertId = randomUUID();
      db.prepare(
        `INSERT INTO _dispatch_ai_alerts(
           id, job_id, job_identifier, booking_id, customer_id, customer_name, customer_phone, customer_email,
           channel, urgency, preferred_date, preferred_window, issue, conversation_summary, source_reference,
           campaign_id, referred_by_name, status
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending_confirmation')`,
      ).run(
        alertId,
        jobId,
        jobIdentifier,
        hasResBookings ? bookingId : null,
        customer.id,
        customer.name,
        customer.phone || String(args.phone || ""),
        customer.email || String(args.email || ""),
        channel,
        urgency,
        preferredDate,
        preferredWindow,
        issue,
        String(args.conversation_summary || "").trim(),
        String(args.source_reference || "").trim(),
        args.campaign_id || null,
        String(args.referred_by_name || "").trim(),
      );

      return { alertId, jobId, jobIdentifier, bookingId, customer };
    });

    // 6. Post alert directly into Team Chat for Owner/Manager
    const channelLabel = channel === "email_ai" ? "Email AI" : channel === "website_ai" ? "Website AI" : channel;
    const alertText = [
      `🔔 **AI Booking Awaiting Confirmation** (${channelLabel} · ${urgency.toUpperCase()})`,
      `• **Job:** ${result.jobIdentifier} (Unassigned in Dispatcher)`,
      `• **Customer:** ${result.customer.name}${result.customer.phone ? ` · ${result.customer.phone}` : ""}${result.customer.email ? ` · ${result.customer.email}` : ""}`,
      `• **Requested:** ${preferredDate} (${preferredWindow} · ${scheduledTime})`,
      `• **Issue:** ${issue}`,
      args.conversation_summary ? `• **Summary:** ${String(args.conversation_summary).trim()}` : "",
      `👉 Open **Dispatcher → Call Intake & Booking** to confirm and assign a technician.`,
    ]
      .filter(Boolean)
      .join("\n");

    const chatAlert = postManagerAlert ? postManagerAlert(alertText) : null;
    if (chatAlert?.messageId) {
      db.prepare("UPDATE _dispatch_ai_alerts SET team_message_id = ? WHERE id = ?").run(
        chatAlert.messageId,
        result.alertId,
      );
    }

    return {
      status: "booked_pending_confirmation",
      pending_manager_confirmation: true,
      alert_id: result.alertId,
      job_id: result.jobId,
      job_identifier: result.jobIdentifier,
      customer_id: result.customer.id,
      customer_name: result.customer.name,
      preferred_date: preferredDate,
      preferred_window: preferredWindow,
      scheduled_time: scheduledTime,
      manager_notified: Boolean(chatAlert),
      notified_team: chatAlert?.teamName || null,
      customer_reply_suggestion: `We have received your service request (${result.jobIdentifier}) for ${preferredDate} (${preferredWindow}). Our dispatch manager has been alerted and will confirm your appointment shortly.`,
    };
  }

  function listAlerts(status = "pending_confirmation") {
    const where =
      status && status !== "all" && ["pending_confirmation", "confirmed", "dismissed"].includes(status)
        ? "WHERE status = ?"
        : "";
    const rows = db
      .prepare(`SELECT * FROM _dispatch_ai_alerts ${where} ORDER BY created_at DESC LIMIT 100`)
      .all(...(where ? [status] : []));
    return { alerts: rows };
  }

  function confirmAlert(actor, alertId, { technicianId = null, scheduledDate = null, scheduledTime = null } = {}) {
    return transaction(db, () => {
      const alert = db.prepare("SELECT * FROM _dispatch_ai_alerts WHERE id = ?").get(alertId);
      if (!alert) throw new Error("AI booking alert not found.");
      if (technicianId) {
        const tech = db.prepare("SELECT id FROM technicians WHERE id = ?").get(technicianId);
        if (!tech) throw new Error("Technician not found.");
      }
      db.prepare(
        `UPDATE jobs
         SET status = 'confirmed',
             technician_id = COALESCE(?, technician_id),
             scheduled_date = COALESCE(?, scheduled_date),
             scheduled_time = COALESCE(?, scheduled_time),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(technicianId || null, scheduledDate || null, scheduledTime || null, alert.job_id);

      db.prepare(
        `UPDATE _dispatch_ai_alerts
         SET status = 'confirmed', confirmed_by = ?, confirmed_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(actor.id, alertId);

      const updated = db.prepare("SELECT * FROM _dispatch_ai_alerts WHERE id = ?").get(alertId);
      return { alert: updated, jobId: alert.job_id, status: "confirmed" };
    });
  }

  function dismissAlert(actor, alertId) {
    const alert = db.prepare("SELECT * FROM _dispatch_ai_alerts WHERE id = ?").get(alertId);
    if (!alert) throw new Error("AI booking alert not found.");
    db.prepare(
      "UPDATE _dispatch_ai_alerts SET status = 'dismissed', confirmed_by = ?, confirmed_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(actor.id, alertId);
    return { alert: db.prepare("SELECT * FROM _dispatch_ai_alerts WHERE id = ?").get(alertId) };
  }

  // ---- JSON-RPC 2.0 MCP HTTP App (mounted at /api/mcp, outside cookie auth.guard) ----
  const mcpApp = new Hono();
  mcpApp.use("*", bodyLimit({ maxSize: 100000, onError: (c) => c.json({ error: "Request too large." }, 413) }));

  mcpApp.get("/", (c) =>
    c.json({
      name: "openfieldservice-dispatch-mcp",
      version: "1.0.0",
      protocolVersion: "2025-03-26",
      transport: "streamable-http",
      authentication: "Bearer <OFS_MCP_API_KEY> or X-API-Key header",
      tools: TOOLS.map((t) => t.name),
    }),
  );

  mcpApp.post("/", async (c) => {
    const actor = authenticateMcp(c);
    if (!actor) {
      return c.json(
        { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized. Provide a valid Bearer token or X-API-Key." } },
        401,
      );
    }

    let req;
    try {
      req = await c.req.json();
    } catch {
      return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON payload." } }, 400);
    }

    const id = req?.id ?? null;
    const method = req?.method;
    const params = req?.params || {};

    if (method === "notifications/initialized") {
      return c.body(null, 202);
    }
    if (method === "ping") {
      return c.json({ jsonrpc: "2.0", id, result: {} });
    }
    if (method === "initialize") {
      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "openfieldservice-dispatch-mcp", version: "1.0.0" },
        },
      });
    }
    if (method === "tools/list") {
      return c.json({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    }
    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};
      try {
        let output;
        if (toolName === "dispatch_check_availability") output = checkAvailability(args);
        else if (toolName === "dispatch_lookup_customer") output = lookupCustomer(args);
        else if (toolName === "dispatch_list_campaigns") output = listCampaigns();
        else if (toolName === "dispatch_book_call") output = bookCall(actor, args);
        else if (toolName === "dispatch_list_pending_confirmations") output = listAlerts(args.status || "pending_confirmation");
        else if (toolName === "dispatch_confirm_booking")
          output = confirmAlert(actor, args.alert_id, {
            technicianId: args.technician_id || null,
            scheduledDate: args.scheduled_date || null,
            scheduledTime: args.scheduled_time || null,
          });
        else {
          return c.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: `Unknown tool: ${toolName}` },
          });
        }
        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
            structuredContent: output,
            isError: false,
          },
        });
      } catch (err) {
        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: (err && err.message) || "Tool execution failed." }],
            isError: true,
          },
        });
      }
    }

    return c.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    });
  });

  // ---- Staff Admin & Dispatcher Alert Endpoints (mounted at /api/mcp-admin under auth.guard) ----
  const adminApp = new Hono();
  const requireStaff = (c) => {
    const user = currentUser ? currentUser(c) : null;
    if (!user?.active) return null;
    return user;
  };

  adminApp.get("/alerts", (c) => {
    const user = requireStaff(c);
    if (!user) return c.json({ error: "Sign in to continue." }, 401);
    const status = c.req.query("status") || "pending_confirmation";
    return c.json(listAlerts(status));
  });

  adminApp.post("/alerts/:id/confirm", async (c) => {
    const user = requireStaff(c);
    if (!user || !["owner", "admin", "member"].includes(user.role))
      return c.json({ error: "Manager or staff access required." }, 403);
    const body = await c.req.json().catch(() => ({}));
    try {
      return c.json(
        confirmAlert(user, c.req.param("id"), {
          technicianId: body.technicianId || null,
          scheduledDate: body.scheduledDate || null,
          scheduledTime: body.scheduledTime || null,
        }),
      );
    } catch (err) {
      return c.json({ error: (err && err.message) || "Could not confirm booking." }, 400);
    }
  });

  adminApp.post("/alerts/:id/dismiss", (c) => {
    const user = requireStaff(c);
    if (!user || !["owner", "admin", "member"].includes(user.role))
      return c.json({ error: "Manager or staff access required." }, 403);
    try {
      return c.json(dismissAlert(user, c.req.param("id")));
    } catch (err) {
      return c.json({ error: (err && err.message) || "Could not dismiss alert." }, 400);
    }
  });

  adminApp.get("/keys", (c) => {
    const user = requireStaff(c);
    if (!user || !["owner", "admin"].includes(user.role))
      return c.json({ error: "Owner or Administrator access required." }, 403);
    const rows = db
      .prepare("SELECT id, label, key_prefix AS keyPrefix, last_used_at AS lastUsedAt, revoked_at AS revokedAt, created_at AS createdAt FROM _mcp_api_keys ORDER BY created_at DESC")
      .all();
    return c.json({ keys: rows, envKeyConfigured: Boolean((env.OFS_MCP_API_KEY || "").trim()) });
  });

  adminApp.post("/keys", async (c) => {
    const user = requireStaff(c);
    if (!user || !["owner", "admin"].includes(user.role))
      return c.json({ error: "Owner or Administrator access required." }, 403);
    const body = await c.req.json().catch(() => ({}));
    const label = String(body.label || "Website / Email AI Agent").trim().slice(0, 100);
    const rawKey = "ofs_mcp_" + randomBytes(24).toString("hex");
    const id = randomUUID();
    db.prepare(
      "INSERT INTO _mcp_api_keys(id, label, key_prefix, key_hash, created_by) VALUES(?,?,?,?,?)",
    ).run(id, label, rawKey.slice(0, 16) + "…", sha256(rawKey), user.id);
    return c.json({ id, label, apiKey: rawKey, keyPrefix: rawKey.slice(0, 16) + "…" }, 201);
  });

  adminApp.delete("/keys/:id", (c) => {
    const user = requireStaff(c);
    if (!user || !["owner", "admin"].includes(user.role))
      return c.json({ error: "Owner or Administrator access required." }, 403);
    db.prepare("UPDATE _mcp_api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?").run(c.req.param("id"));
    return c.json({ ok: true });
  });

  return { mcpApp, adminApp, tools: TOOLS };
}
