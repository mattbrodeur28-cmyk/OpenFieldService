import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStorage } from "../src/server/sqlite.mjs";
import { createCrmService } from "../src/server/crm/service.mjs";
import { createInventory } from "../src/server/inventory/service.mjs";
import { createPurchasing } from "../src/server/purchasing/service.mjs";
import { createSalesService } from "../src/server/sales/service.mjs";
import { createBillingProfiles } from "../src/server/sales/billing-profiles.mjs";
import { createQuotes } from "../src/server/sales/quotes.mjs";

const owner = { id: "owner-1", role: "owner", active: true };
const member = { id: "member-1", role: "member", active: true };

test("CRM-002 / CRM-007: Customer 360 projects staff-recorded communications", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ofs-crm360-comms-"));
  const storage = openStorage(join(dir, "s.sqlite"));
  const db = storage.database;
  t.after(() => { storage.close(); rmSync(dir, { recursive: true, force: true }); });

  const crm = createCrmService({ storage });
  const customerId = randomUUID();
  db.prepare("INSERT INTO customers(id,name) VALUES(?,?)").run(customerId, "Beacon Mechanical");

  crm.communications.record(owner, customerId, {
    channel: "call",
    direction: "outbound",
    subject: "Quarterly PM scheduling call",
    summary: "Confirmed chiller access window",
    reference: "CALL-42",
    occurredAt: "2027-01-10T15:00:00Z",
  });

  const summary = crm.customer360(owner, customerId);
  assert.equal(summary.communications.count, 1);
  assert.equal(summary.communications.recent[0].subject, "Quarterly PM scheduling call");
  assert.equal(summary.communications.recent[0].channel, "call");
});

test("SALES-007 & SALES-016: Multi-option quotes and accepted-quote-to-draft-PO procurement", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ofs-sales-m4-"));
  const storage = openStorage(join(dir, "s.sqlite"));
  const db = storage.database;
  t.after(() => { storage.close(); rmSync(dir, { recursive: true, force: true }); });

  const inventory = createInventory({ storage });
  const purchasing = createPurchasing({ storage, inventory });
  const sales = createSalesService({ storage, owners: () => [owner, member] });
  const pricing = createBillingProfiles({ storage, sales, materialSnapshots: () => [] });
  const quotes = createQuotes({ storage, sales, pricing, materialSnapshots: () => [] });

  const customerId = randomUUID();
  db.prepare("INSERT INTO customers(id,name) VALUES(?,?)").run(customerId, "Summit Hospital");
  const materialId = randomUUID();
  db.prepare("INSERT INTO materials(id,name,unit,unit_cost,in_stock) VALUES(?,?,?,?,?)").run(materialId, "Belimo Actuator", "ea", 125.0, 0);

  // Create warehouse location & active supplier in Purchasing
  const locId = randomUUID();
  db.prepare("INSERT INTO _inventory_locations(id,name,code,kind,active,version) VALUES(?,?,?,'warehouse',1,1)").run(locId, "Main Warehouse", "WH-1");
  const loc = { id: locId };
  const supId = randomUUID();
  db.prepare(
    "INSERT INTO _purch_suppliers(id,code,name,contact_name,email,phone,address,terms,active,version) VALUES(?,?,?,?,?,?,?,?,1,1)"
  ).run(supId, "SUP-1", "Controls Supply Co", "Sam", "sam@supply.test", "555-0199", "100 Supply Way", "Net 30");
  const sup = { id: supId };

  // Create opportunity + seed a quote head and an accepted offer revision with a material line
  const pipeline = sales.pipelines()[0];
  const opp = sales.saveOpportunity(owner, null, {
    title: "AHU Actuator Retrofit",
    pipelineId: pipeline.id,
    stageId: pipeline.stages[0].id,
    customerId,
    prospectName: "",
    contactName: "Jane",
    contactEmail: "jane@summit.test",
    contactPhone: "555-0101",
    segment: "commercial",
    source: "referral",
    ownerId: owner.id,
    expectedValue: 5000,
    probability: 60,
    expectedCloseDate: "2027-03-01",
    nextAction: "Send quote",
    nextActionDate: "2027-01-15",
    siteId: null,
    assetId: null,
    notes: "",
  });

  const quoteId = randomUUID();
  db.prepare("INSERT INTO _sales_quotes(id,number,opportunity_id,status,version) VALUES(?,1,?,'draft',1)").run(quoteId, opp.id);
  const pricingJson = JSON.stringify({
    lines: [
      { id: "line-mat-1", category: "material", materialId, description: "Belimo Actuator", quantityMilli: 10000, unitCostCents: 12500 },
    ],
  });
  db.prepare(
    "INSERT INTO _sales_quote_revisions(quote_id,version,actor_id,document_json,pricing_json) VALUES(?,1,?,?,?)"
  ).run(quoteId, owner.id, JSON.stringify({ title: "AHU Actuator Retrofit" }), pricingJson);

  // SALES-007: Multi-option quotes (Good / Better / Best)
  const goodId = randomUUID();
  const betterId = randomUUID();
  const good = quotes.quoteOptions.save(owner, quoteId, {
    id: goodId, requestKey: randomUUID(), expectedVersion: 0,
    label: "Good — Standard Replacement", summary: "Replace failed actuators only", recommended: false, position: 1,
    taxCents: 10000,
    items: [{ description: "Belimo Actuator x4", quantityMilli: 4000, unitPriceCents: 25000, materialId }],
  }).option;
  assert.equal(good.subtotalCents, 100000);
  assert.equal(good.totalCents, 110000);

  quotes.quoteOptions.save(owner, quoteId, {
    id: betterId, requestKey: randomUUID(), expectedVersion: 0,
    label: "Better — Full Bank + Calibration", summary: "Replace all 10 actuators and recalibrate", recommended: true, position: 2,
    taxCents: 25000,
    items: [{ description: "Belimo Actuator x10", quantityMilli: 10000, unitPriceCents: 25000, materialId }],
  });

  const selected = quotes.quoteOptions.select(owner, quoteId, betterId, { requestKey: randomUUID(), selectedBy: "Hospital Facilities Dir" }).option;
  assert.equal(selected.selected, true);
  // Cannot select a second option or overwrite/delete the selected option
  assert.throws(() => quotes.quoteOptions.select(owner, quoteId, goodId, { requestKey: randomUUID(), selectedBy: "Other" }), /already selected/);
  assert.throws(() => quotes.quoteOptions.remove(owner, quoteId, betterId), /Cannot delete a selected/);

  // SALES-016: Reject procurement before quote acceptance
  assert.equal(quotes.procurement.summary(owner, quoteId).accepted, false);
  assert.throws(() => quotes.procurement.allocate(owner, quoteId, {
    requestKey: randomUUID(), supplierId: sup.id, locationId: loc.id,
    lines: [{ lineKey: "line-mat-1", quantityMilli: 4000 }],
    reason: "Attempt procurement before acceptance",
  }), /Only an accepted quote/);

  // Record accepted offer on revision 1
  db.prepare("INSERT INTO _sales_quote_issuer_revisions(version,actor_id,config_json) VALUES(1,?,'{}')").run(owner.id);
  const offerId = randomUUID();
  db.prepare(
    "INSERT INTO _sales_quote_offers(id,quote_id,quote_version,opportunity_version,issuer_version,customer_id,document_json,document_hash,html,html_hash,review_json,actor_id,offered_at) VALUES(?,?,1,1,1,?,'{}','h1','','h2','{}',?,'2027-01-10T10:00:00Z')"
  ).run(offerId, quoteId, customerId, owner.id);
  db.prepare(
    "INSERT INTO _sales_quote_lifecycle_events(id,quote_id,quote_version,sequence,offer_id,actor_id,action,evidence_json,note,recorded_at) VALUES(?,?,1,1,?,?,'accepted','{}','Approved','2027-01-10T12:00:00Z')"
  ).run(randomUUID(), quoteId, offerId, owner.id);

  // Member cannot create PO allocations; Owner/Admin can
  assert.throws(() => quotes.procurement.allocate(member, quoteId, {
    requestKey: randomUUID(), supplierId: sup.id, locationId: loc.id,
    lines: [{ lineKey: "line-mat-1", quantityMilli: 4000 }],
    reason: "Member should not allocate PO",
  }), /Owner or Administrator/);

  // Partial allocation (4 of 10) creates new draft PO
  const allocReq1 = {
    requestKey: randomUUID(), supplierId: sup.id, locationId: loc.id,
    lines: [{ lineKey: "line-mat-1", quantityMilli: 4000 }],
    reason: "Order first batch of 4 actuators for accepted quote",
  };
  const po1 = quotes.procurement.allocate(owner, quoteId, allocReq1);
  assert.equal(po1.status, "draft");
  assert.equal(po1.allocations.length, 1);
  // Idempotent replay returns exact same PO without duplicating
  assert.deepEqual(quotes.procurement.allocate(owner, quoteId, allocReq1), po1);

  // Remaining demand is 6; ordering 7 must fail
  const midSummary = quotes.procurement.summary(owner, quoteId);
  assert.equal(midSummary.lines[0].orderedMilli, 4000);
  assert.equal(midSummary.lines[0].remainingMilli, 6000);
  assert.throws(() => quotes.procurement.allocate(owner, quoteId, {
    requestKey: randomUUID(), targetPoId: po1.poId,
    lines: [{ lineKey: "line-mat-1", quantityMilli: 7000 }],
    reason: "Attempt to over-order remaining quote demand",
  }), /exceeds remaining un-ordered quote demand/);

  // Appending remaining 6 to the existing draft PO succeeds
  const po1Append = quotes.procurement.allocate(owner, quoteId, {
    requestKey: randomUUID(), targetPoId: po1.poId,
    lines: [{ lineKey: "line-mat-1", quantityMilli: 6000 }],
    reason: "Append remaining 6 actuators to existing draft PO",
  });
  assert.equal(po1Append.poId, po1.poId);
  assert.equal(quotes.procurement.summary(owner, quoteId).lines[0].remainingMilli, 0);

  // Issued PO cannot be appended to
  db.prepare("UPDATE _purch_orders SET status='issued' WHERE id=?").run(po1.poId);
  assert.throws(() => quotes.procurement.allocate(owner, quoteId, {
    requestKey: randomUUID(), targetPoId: po1.poId,
    lines: [{ lineKey: "line-mat-1", quantityMilli: 1000 }],
    reason: "Attempt to append to issued PO",
  }), /exceeds remaining|Only editable draft/);
});
