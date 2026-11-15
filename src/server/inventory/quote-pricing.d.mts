import type { DatabaseSync } from "node:sqlite";
export interface QuoteMaterialSnapshot {
  id: string;
  name: string;
  unit: string;
  unitCostCents: number | null;
  source: "company_weighted_average" | "no_company_stock";
  sourceVersion: string;
  quantityMilli: number;
  valueMillicents: string;
}
/** Caller owns a synchronous transaction and Sales access checks. */
export function quoteMaterialSnapshots(
  db: DatabaseSync,
  ids: string[],
): QuoteMaterialSnapshot[];
