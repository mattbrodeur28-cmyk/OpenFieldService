import { randomUUID } from "node:crypto";
import { fixture, owner } from "./service-execution.mjs";
export const reason = "Reviewed purchasing quantities, supplier terms and cost";
export function setup(t) {
  const f = fixture(t),
    p = f.module.purchasing,
    inv = f.module.inventory,
    material = randomUUID();
  f.db
    .prepare(
      "INSERT INTO materials(id,name,unit,unit_cost,in_stock) VALUES(?,'Controller relay','ea',10,0)",
    )
    .run(material);
  const place = inv.saveLocation(owner, {
    expectedVersion: 0,
    name: "Receiving warehouse",
    code: "RCV",
    kind: "warehouse",
    technicianId: null,
    active: true,
    reason,
  });
  const vendor = {
    requestKey: randomUUID(),
    id: randomUUID(),
    expectedVersion: 0,
    code: "SUP-1",
    name: "Test supplier",
    contactName: "Sales",
    email: "",
    phone: "",
    address: "Fixture warehouse",
    terms: "Net 30",
    active: true,
    reason,
  };
  p.saveSupplier(owner, vendor);
  const lineId = randomUUID();
  const draft = {
    requestKey: randomUUID(),
    id: randomUUID(),
    expectedVersion: 0,
    supplierId: vendor.id,
    locationId: place.id,
    currency: "USD",
    expectedDate: "2026-12-01",
    terms: "Net 30",
    notes: "Fixture material PO",
    taxBasisPoints: 725,
    freightCents: 500,
    lines: [
      {
        id: lineId,
        materialId: material,
        jobId: null,
        description: "Relay stock",
        quantityMilli: 10000,
        unitCostCents: 1000,
      },
    ],
    reason,
  };
  p.saveOrder(owner, draft);
  return { ...f, p, inv, material, place, vendor, draft, lineId };
}
export const act = (f, action) =>
  f.p.action(owner, {
    requestKey: randomUUID(),
    orderId: f.draft.id,
    expectedVersion: f.p.detail(owner, f.draft.id).order.version,
    action,
    reason,
  });
export function issue(f) {
  act(f, "approve");
  act(f, "issue");
}
export function receipt(
  f,
  acceptedMilli = 4000,
  unitCostCents = 1000,
  overrides = {},
) {
  return {
    requestKey: randomUUID(),
    orderId: f.draft.id,
    lineId: f.lineId,
    expectedVersion: f.p.detail(owner, f.draft.id).order.version,
    expectedStockVersion:
      f.inv
        .detail(owner, f.place.id)
        .stock.find((s) => s.material_id === f.material)?.version || 0,
    deliveredMilli: acceptedMilli,
    acceptedMilli,
    rejectedMilli: 0,
    unitCostCents,
    packingSlip: "FIXTURE-1",
    priceVarianceReason:
      unitCostCents === 1000
        ? ""
        : "Reviewed supplier price variance on delivery",
    approveOverReceipt: false,
    overReceiptReason: "",
    reason,
    ...overrides,
  };
}
