import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openStorage } from "../src/server/sqlite.mjs";
import { createSales } from "../src/server/sales/http.mjs";
import { createDispatchMcp } from "../src/server/mcp/dispatch-mcp.mjs";

const adminUser = {
  id: "u-owner",
  name: "Owner",
  email: "owner@example.test",
  role: "owner",
  active: true,
  mustChangePassword: false,
};

function setupEnv() {
  const dir = mkdtempSync(join(tmpdir(), "ofs-camp-mcp-"));
  const storage = openStorage(join(dir, "service.sqlite"));
  const alerts = [];
  const sales = createSales({
    storage,
    currentUser: () => adminUser,
    owners: () => [{ id: adminUser.id, name: adminUser.name }],
    resolveMessage: () => null,
    materialSnapshots: () => [],
  });
  const mcp = createDispatchMcp({
    storage,
    currentUser: () => adminUser,
    postManagerAlert: (content) => {
      const msg = { teamId: "team-1", teamName: "Dispatch Alerts", messageId: randomUUID(), content };
      alerts.push(msg);
      return msg;
    },
    env: { OFS_MCP_API_KEY: "test-secret-mcp-key" },
  });
  return {
    dir,
    storage,
    sales,
    mcp,
    alerts,
    cleanup() {
      storage.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("SALES-019 & SALES-020: Ad campaigns, referral attribution and ROI analytics", async () => {
  const env = setupEnv();
  try {
    const hdrs = { "Content-Type": "application/json", "X-Requested-With": "OpenFieldService" };

    // 1. Create a pipeline & open stage
    const pRes = await env.sales.app.request("/pipelines", {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({
        name: "Default Sales",
        stages: [
          { name: "New Lead", kind: "open", probability: 20, requiredFields: [], allowedFrom: [] },
          { name: "Won", kind: "won", probability: 100, requiredFields: [], allowedFrom: [] },
          { name: "Lost", kind: "lost", probability: 0, requiredFields: [], allowedFrom: [] },
        ],
      }),
    });
    assert.equal(pRes.status, 201);
    const { pipeline } = await pRes.json();
    const openStage = pipeline.stages.find((s) => s.kind === "open");

    // 2. Create an ad campaign
    const cRes = await env.sales.app.request("/campaigns", {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({
        name: "Summer AC Google Ads",
        channel: "google_ads",
        status: "active",
        trackingCode: "utm_campaign=summer-ac",
        budgetCents: 200000,
        spendCents: 50000,
        startDate: "2026-06-01",
      }),
    });
    assert.equal(cRes.status, 201);
    const { campaign } = await cRes.json();
    assert.equal(campaign.name, "Summer AC Google Ads");
    assert.equal(campaign.spendCents, 50000);

    // 3. Create an opportunity attributed to the campaign + referrer
    const oppRes = await env.sales.app.request("/opportunities", {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({
        title: "RTU Replacement",
        pipelineId: pipeline.id,
        stageId: openStage.id,
        ownerId: adminUser.id,
        prospectName: "Acme HVAC",
        contactName: "Jane Doe",
        contactEmail: "jane@acme.test",
        contactPhone: "555-0100",
        segment: "commercial",
        source: "Google Ads",
        campaignId: campaign.id,
        referredByName: "Bob Builder",
        expectedValue: 250000,
        probability: 20,
        expectedCloseDate: "",
        nextAction: "",
        nextActionDate: "",
        customerId: null,
        siteId: null,
        assetId: null,
        notes: "",
      }),
    });
    assert.equal(oppRes.status, 201);
    const { opportunity } = await oppRes.json();
    assert.equal(opportunity.campaign_id, campaign.id);
    assert.equal(opportunity.campaign_name, "Summer AC Google Ads");
    assert.equal(opportunity.referred_by_name, "Bob Builder");

    // 4. Create a customer + job + invoice and attribute the job to the campaign
    const custId = randomUUID();
    const jobId = randomUUID();
    const invId = randomUUID();
    env.storage.database.prepare("INSERT INTO customers(id,name,phone,email) VALUES(?,?,?,?)").run(custId, "Acme HVAC", "555-0100", "jane@acme.test");
    env.storage.database.prepare("INSERT INTO jobs(id,identifier,customer_id,status) VALUES(?,?,?,'completed')").run(jobId, "JOB-1001", custId);
    env.storage.database.prepare("INSERT INTO invoices(id,identifier,customer_id,job_id,status,total) VALUES(?,?,?,?,'paid',?)").run(invId, "INV-1001", custId, jobId, 1500);

    const attrRes = await env.sales.app.request("/attributions", {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({
        entityType: "job",
        entityId: jobId,
        campaignId: campaign.id,
        referralChannel: "google_ads",
        referredByName: "Bob Builder",
      }),
    });
    assert.equal(attrRes.status, 201);

    // 5. Verify analytics & drill-down
    const anRes = await env.sales.app.request("/campaigns/analytics");
    assert.equal(anRes.status, 200);
    const an = await anRes.json();
    assert.equal(an.summary.totalSpendCents, 50000);
    assert.equal(an.summary.totalLeads, 2); // 1 opp + 1 job
    assert.equal(an.summary.totalBookedJobs, 1);
    assert.equal(an.summary.totalRevenueCents, 150000);
    assert.equal(an.summary.blendedRoas, 3); // $1500 / $500 = 3x

    const detRes = await env.sales.app.request(`/campaigns/${campaign.id}`);
    assert.equal(detRes.status, 200);
    const det = await detRes.json();
    assert.equal(det.opportunities.length, 1);
    assert.equal(det.jobs.length, 1);
  } finally {
    env.cleanup();
  }
});

test("Dispatch MCP: auth, availability, AI booking + Manager alert + confirmation", async () => {
  const env = setupEnv();
  try {
    // Seed a technician
    const techId = randomUUID();
    env.storage.database.prepare("INSERT INTO technicians(id,name,active) VALUES(?,?,1)").run(techId, "Alex Tech");

    // 1. Unauthenticated MCP call is rejected when no API key & no staff session
    const unauthMcp = createDispatchMcp({
      storage: env.storage,
      currentUser: () => null,
      env: { OFS_MCP_API_KEY: "test-secret-mcp-key" },
    });
    const unauthRes = await unauthMcp.mcpApp.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    assert.equal(unauthRes.status, 401);

    const mcpHeaders = {
      "Content-Type": "application/json",
      Authorization: "Bearer test-secret-mcp-key",
    };

    // 2. initialize + tools/list
    const initRes = await env.mcp.mcpApp.request("/", {
      method: "POST",
      headers: mcpHeaders,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    assert.equal(initRes.status, 200);
    const initJson = await initRes.json();
    assert.equal(initJson.result.serverInfo.name, "openfieldservice-dispatch-mcp");

    const listRes = await env.mcp.mcpApp.request("/", {
      method: "POST",
      headers: mcpHeaders,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    const listJson = await listRes.json();
    const names = listJson.result.tools.map((t) => t.name);
    assert.ok(names.includes("dispatch_check_availability"));
    assert.ok(names.includes("dispatch_book_call"));
    assert.ok(names.includes("dispatch_confirm_booking"));

    // 3. Check availability
    const availRes = await env.mcp.mcpApp.request("/", {
      method: "POST",
      headers: mcpHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "dispatch_check_availability", arguments: { date: "2026-11-28" } },
      }),
    });
    const availJson = await availRes.json();
    assert.equal(availJson.result.isError, false);
    assert.equal(availJson.result.structuredContent.windows.length, 2);

    // 4. Book a call via Website AI
    const bookRes = await env.mcp.mcpApp.request("/", {
      method: "POST",
      headers: mcpHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "dispatch_book_call",
          arguments: {
            customer_name: "Sarah Homeowner",
            email: "sarah@example.test",
            phone: "860-555-0142",
            address: "123 Maple St, Hartford, CT",
            issue: "Furnace blowing cold air",
            channel: "website_ai",
            urgency: "urgent",
            preferred_date: "2026-11-28",
            preferred_window: "morning",
            conversation_summary: "Customer chatted on website; furnace stopped heating this morning.",
          },
        },
      }),
    });
    const bookJson = await bookRes.json();
    assert.equal(bookJson.result.isError, false);
    const booked = bookJson.result.structuredContent;
    assert.equal(booked.status, "booked_pending_confirmation");
    assert.equal(booked.pending_manager_confirmation, true);
    assert.equal(booked.manager_notified, true);
    assert.equal(env.alerts.length, 1);
    assert.ok(env.alerts[0].content.includes("Sarah Homeowner"));
    assert.ok(env.alerts[0].content.includes("Furnace blowing cold air"));

    // 5. Verify pending confirmation alert appears in admin API & confirm it
    const alertsRes = await env.mcp.adminApp.request("/alerts?status=pending_confirmation");
    const alertsJson = await alertsRes.json();
    assert.equal(alertsJson.alerts.length, 1);
    assert.equal(alertsJson.alerts[0].id, booked.alert_id);

    const confirmRes = await env.mcp.adminApp.request(`/alerts/${booked.alert_id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ technicianId: techId }),
    });
    assert.equal(confirmRes.status, 200);

    const jobRow = env.storage.database.prepare("SELECT status, technician_id FROM jobs WHERE id = ?").get(booked.job_id);
    assert.equal(jobRow.status, "confirmed");
    assert.equal(jobRow.technician_id, techId);
  } finally {
    env.cleanup();
  }
});
