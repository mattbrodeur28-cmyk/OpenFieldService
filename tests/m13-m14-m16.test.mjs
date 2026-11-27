import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStorage } from "../src/server/sqlite.mjs";
import { createInventory } from "../src/server/inventory/service.mjs";
import { createInventoryExtensions } from "../src/server/inventory/reservations.mjs";
import { createPurchasing } from "../src/server/purchasing/service.mjs";
import { createPurchasingExtensions } from "../src/server/purchasing/extensions.mjs";
import { createRmsService } from "../src/server/rms/service.mjs";

const owner = { id: "owner-1", role: "owner", active: true };
const member = { id: "member-1", role: "member", active: true };

test("M14 RMS: rules, cylinders, no refrigerant mixing, unknown charge stays null, leak threshold and immutable ledger", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ofs-m14-"));
  const storage = openStorage(join(dir, "s.sqlite"));
  const db = storage.database;
  t.after(() => { storage.close(); rmSync(dir, { recursive: true, force: true }); });

  const rms = createRmsService({ storage });
  const customerId = randomUUID();
  const siteId = randomUUID();
  const assetId = randomUUID();
  const assetUnknownId = randomUUID();
  db.prepare("INSERT INTO customers(id,name) VALUES(?,?)").run(customerId, "Metro Cold Storage");
  db.prepare("INSERT INTO sites(id,customer_id,name) VALUES(?,?,?)").run(siteId, customerId, "Plant 1");
  db.prepare("INSERT INTO assets(id,customer_id,site_id,name,serial_number) VALUES(?,?,?,?,?)").run(assetId, customerId, siteId, "Chiller #1", "CH-100");
  db.prepare("INSERT INTO assets(id,customer_id,site_id,name,serial_number) VALUES(?,?,?,?,?)").run(assetUnknownId, customerId, siteId, "RTU #2", "RTU-200");

  // RMS-001: Regulatory rule (10% max annual leak rate for comfort cooling >= 50 lb = 8000 tenths-oz)
  rms.saveRule(owner, {
    code: "EPA-608-COMFORT", version: 1, jurisdiction: "US-EPA-608", effectiveDate: "2026-01-01",
    equipmentClass: "comfort_cooling", chargeThresholdTenthsOz: 8000, maxLeakRateBps: 1000, repairDeadlineDays: 30,
  });

  // RMS-002: Refrigerants & cylinders
  const r410 = rms.saveRefrigerant(owner, { code: "R-410A", name: "R-410A", gwp: 2088, ozoneDepleting: false }).refrigerant;
  const r134 = rms.saveRefrigerant(owner, { code: "R-134a", name: "R-134a", gwp: 1430, ozoneDepleting: false }).refrigerant;
  const cyl = rms.saveCylinder(member, {
    tag: "CYL-001", refrigerantId: r410.id, status: "virgin", tareTenthsOz: 800,
    capacityTenthsOz: 4000, currentMassTenthsOz: 3000, certificationRef: "EPA-608-999",
  }).cylinder;

  // RMS-003: Baselines (100 lb = 16000 tenths-oz on Chiller #1; NULL charge on RTU #2)
  rms.saveBaseline(member, { assetId, refrigerantId: r410.id, fullChargeTenthsOz: 16000, circuitName: "Circuit A", equipmentClass: "comfort_cooling", verifiedSource: "Nameplate", verifiedDate: "2026-01-15" });
  const unknownBase = rms.saveBaseline(member, { assetId: assetUnknownId, refrigerantId: r410.id, fullChargeTenthsOz: null, circuitName: "Main", equipmentClass: "comfort_cooling" }).baseline;
  assert.equal(unknownBase.leakRatePct, null);
  assert.equal(unknownBase.status, "unknown_charge");

  // RMS-004/005: Mixing refrigerant rejected
  assert.throws(() => rms.recordEvent(member, {
    requestKey: randomUUID(), eventType: "addition", refrigerantId: r134.id, cylinderId: cyl.id, assetId,
    massTenthsOz: 100, eventAt: new Date().toISOString(), reason: "Attempt wrong refrigerant",
  }), /Refrigerant mismatch/);

  // Adding 2000 tenths-oz (12.5% of 16000) exceeds 10% threshold and deducts cylinder mass
  const evKey = randomUUID();
  const evTime = new Date().toISOString();
  const evRes = rms.recordEvent(member, {
    requestKey: evKey, eventType: "addition", refrigerantId: r410.id, cylinderId: cyl.id, assetId,
    massTenthsOz: 2000, eventAt: evTime, reason: "Topped off low suction circuit",
  });
  assert.equal(evRes.equipment.thresholdExceeded, true);
  assert.equal(evRes.equipment.leakRatePct, 12.5);
  assert.equal(rms.listCylinders(owner).find((c) => c.id === cyl.id).currentMassTenthsOz, 1000);
  // Idempotent replay returns exact same result without deducting twice
  assert.deepEqual(rms.recordEvent(member, {
    requestKey: evKey, eventType: "addition", refrigerantId: r410.id, cylinderId: cyl.id, assetId,
    massTenthsOz: 2000, eventAt: evTime, reason: "Topped off low suction circuit",
  }), evRes);
  assert.equal(rms.listCylinders(owner).find((c) => c.id === cyl.id).currentMassTenthsOz, 1000);

  // Immutable ledger trigger
  assert.throws(() => db.prepare("DELETE FROM _rms_events").run(), /RMS_EVIDENCE_IMMUTABLE/);

  // RMS-006/007/008: Leak inspection + dashboard + CSV export
  const insp = rms.recordLeakInspection(member, { assetId, kind: "repair", passed: true, notes: "Brazed suction elbow", occurredAt: new Date().toISOString() }).inspection;
  assert.equal(insp.leakRateBps, 1250);
  const dash = rms.dashboard(owner);
  assert.equal(dash.kpis.leakExceededCount, 1);
  assert.equal(dash.kpis.unknownChargeCount, 1);
  const csv = rms.exportRecords(owner, "csv");
  assert.match(csv.body, /CYL-001/);
});

test("M13 inventory reservations/stocktakes and M16 vendor SKUs/credits/reconciliation", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ofs-m13m16-"));
  const storage = openStorage(join(dir, "s.sqlite"));
  const db = storage.database;
  t.after(() => { storage.close(); rmSync(dir, { recursive: true, force: true }); });

  const inventory = createInventory({ storage });
  const invExt = createInventoryExtensions({ storage });
  const purchasing = createPurchasing({ storage, inventory });
  const purchExt = createPurchasingExtensions({ storage });

  const customerId = randomUUID();
  const jobId = randomUUID();
  const matId = randomUUID();
  const locId = randomUUID();
  const supId = randomUUID();
  db.prepare("INSERT INTO customers(id,name) VALUES(?,?)").run(customerId, "Acme");
  db.prepare("INSERT INTO jobs(id,identifier,customer_id,scheduled_date) VALUES(?,?,?,'2027-01-10')").run(jobId, "J-500", customerId);
  db.prepare("INSERT INTO materials(id,name,unit,unit_cost,in_stock) VALUES(?,?,?,?,?)").run(matId, "Contactor 40A", "ea", 25, 0);
  db.prepare("INSERT INTO _inventory_locations(id,name,code,kind,active,version) VALUES(?,?,?,'warehouse',1,1)").run(locId, "Main WH", "WH-1");
  db.prepare("INSERT INTO _inventory_materials(material_id,actor_id) VALUES(?,?)").run(matId, owner.id);
  db.prepare("INSERT INTO _inventory_balances(location_id,material_id,quantity_milli,value_millicents,reorder_milli,version) VALUES(?,?,10000,'25000000',2000,1)").run(locId, matId);

  // M13 TECH-009/010: Stock reservation prevents over-reserving on-hand stock
  const res1 = invExt.reserve(member, { locationId: locId, materialId: matId, jobId, quantityMilli: 6000, reason: "Reserve for chiller job" }).reservation;
  assert.equal(res1.status, "active");
  assert.throws(() => invExt.reserve(member, { locationId: locId, materialId: matId, jobId, quantityMilli: 5000, reason: "Exceeds remaining unreserved" }), /Insufficient unreserved/);
  invExt.releaseReservation(member, res1.id, "consumed");

  // Physical stocktake session + admin approval
  const st = invExt.createStocktake(member, { locationId: locId, notes: "Monthly bin count", counts: [{ materialId: matId, countedMilli: 9000 }] }).stocktake;
  assert.equal(st.counts[0].varianceMilli, -1000);
  assert.equal(invExt.approveStocktake(owner, st.id).status, "approved");

  // M16 PURCH-001/005: Vendor SKU mapping, vendor credit, and PO reconciliation
  db.prepare("INSERT INTO _purch_suppliers(id,code,name,contact_name,email,phone,address,terms,active,version) VALUES(?,?,?,?,?,?,?,?,1,1)")
    .run(supId, "SUP-9", "HVAC Supply", "Pat", "pat@hvac.test", "555-0100", "1 Supply Rd", "Net 30");
  const sku = purchExt.saveVendorSku(owner, { supplierId: supId, materialId: matId, vendorSku: "HS-CONT-40", lastCostCents: 2450, leadTimeDays: 3, preferred: true }).sku;
  assert.equal(sku.vendorSku, "HS-CONT-40");

  const poId = randomUUID();
  db.prepare("INSERT INTO _purch_orders(id,number,supplier_id,location_id,status,currency,terms,notes,tax_basis_points,freight_cents,version) VALUES(?,?,?,?,'issued','USD','Net 30','',0,0,1)")
    .run(poId, "PO-000500", supId, locId);
  purchExt.recordCredit(owner, { orderId: poId, creditNumber: "CR-500", amountCents: 2500, kind: "damaged_allowance", reason: "Damaged carton credit" });
  const recon = purchExt.reconciliation(owner);
  const poRecon = recon.orders.find((o) => o.id === poId);
  assert.equal(poRecon.creditedCents, 2500);
});
