export interface StockLocation {
  id: string;
  name: string;
  code: string;
  kind: "warehouse" | "truck";
  technician_id: string | null;
  active: number;
  version: number;
}
export interface StockItem {
  material_id: string;
  name: string;
  unit: string;
  quantity_milli: number;
  value_millicents: string;
  company_unit_cost_cents: number | null;
  reorder_milli: number;
  version: number;
}
export interface StockOptions {
  managedMaterialIds: string[];
  canManage: boolean;
  technicianId: string | null;
  locations: StockLocation[];
}
export interface StockHistory {
  purchase_order_id: string | null;
  purchase_order_number: string | null;
  reversed_by: string | null;
  id: string;
  kind: string;
  material_id: string;
  job_id: string | null;
  quantity_delta: number;
  value_delta: string;
  reason: string;
  created_at: string;
  balance_version: number;
}
export interface StockDetail {
  location: StockLocation;
  canManage: boolean;
  canIssue: boolean;
  stock: StockItem[];
  history: StockHistory[];
  historyPage: number;
  hasMoreHistory: boolean;
}
export interface CatalogItem {
  id: string;
  name: string;
  unit: string;
  unit_cost: number;
  in_stock: number;
}
export interface StockUsage {
  job_material_id: string;
  movement_id: string;
  material_id: string;
  name: string;
  unit: string;
  quantity_milli: number;
  returned_milli: number;
  version: number;
  created_at: string;
}
export function scaledQuantity(value: string, places = 3) {
  if (!new RegExp("^\\d+(?:\\.\\d{1," + places + "})?$").test(value))
    throw Error(
      "Enter a nonnegative quantity with at most " +
        places +
        " decimal places.",
    );
  const [whole, fraction = ""] = value.split(".");
  const result =
    Number(whole) * 10 ** places + Number(fraction.padEnd(places, "0"));
  if (!Number.isSafeInteger(result)) throw Error("Quantity is too large.");
  return result;
}
export const units = (milli: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(
    milli / 1000,
  );
