import type { StockLocation, CatalogItem } from "./inventory-types";
export interface Supplier {
  id: string;
  code: string;
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  terms: string;
  active: number;
  version: number;
}
export interface PurchaseOptions {
  suppliers: Supplier[];
  locations: StockLocation[];
  materials: CatalogItem[];
  jobs: { id: string; identifier: string }[];
}
export type PurchaseStatus =
  | "draft"
  | "approved"
  | "issued"
  | "partially_received"
  | "received"
  | "closed"
  | "cancelled";
export interface PurchaseOrder {
  id: string;
  number: string;
  supplier_id: string;
  location_id: string;
  status: PurchaseStatus;
  currency: "USD";
  expected_date: string | null;
  terms: string;
  notes: string;
  tax_basis_points: number;
  freight_cents: number;
  version: number;
  supplier_name?: string;
  location_name?: string;
  totalCents?: number;
}
export interface PurchaseLine {
  id: string;
  material_id: string;
  job_id: string | null;
  job_identifier: string | null;
  material_name: string;
  unit: string;
  description: string;
  quantity_milli: number;
  received_milli: number;
  remaining_milli: number;
  unit_cost_cents: number;
}
export interface PurchaseReceipt {
  id: string;
  line_id: string;
  movement_id: string | null;
  accepted_milli: number;
  rejected_milli: number;
  delivered_milli: number;
  unit_cost_cents: number;
  packing_slip: string;
  reason: string;
  created_at: string;
}
export interface PurchaseDetail {
  order: PurchaseOrder;
  supplier: Supplier;
  destination: StockLocation;
  lines: PurchaseLine[];
  issued: {
    revision: number;
    snapshot: { supplier: Supplier; destination: StockLocation };
  } | null;
  totals: {
    subtotalCents: number;
    taxCents: number;
    freightCents: number;
    totalCents: number;
    openMaterialCents: number;
    acceptedMaterialCents: number;
  };
  receipts: PurchaseReceipt[];
  receiptPage: number;
  hasMoreReceipts: boolean;
}
export const purchaseMoney = (cents: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
