import { createHash } from "node:crypto";
import { companyStock } from "./costing.mjs";
import { proportional } from "./domain.mjs";
// Internal Sales read contract; caller owns the service-DB transaction and access check.
// Missing stock costs require a reviewed estimate override, never an invented zero cost.
export function quoteMaterialSnapshots(db, ids) {
  if (!Array.isArray(ids) || ids.length > 100)
    throw new Error("Bounded material identities required.");
  return ids
    .map((id) => {
      const row = db
        .prepare("SELECT id,name,unit FROM materials WHERE id=?")
        .get(id);
      if (!row) return null;
      const pool = companyStock(db, id),
        basis = {
          ...row,
          quantityMilli: pool.quantity,
          valueMillicents: pool.value.toString(),
          balances: pool.rows.map((r) => ({
            locationId: r.location_id,
            version: r.version,
          })),
        };
      return {
        ...row,
        unitCostCents: pool.quantity
          ? Number(proportional(pool.value, 1, pool.quantity))
          : null,
        source: pool.quantity ? "company_weighted_average" : "no_company_stock",
        sourceVersion: createHash("sha256")
          .update(JSON.stringify(basis))
          .digest("hex"),
        quantityMilli: pool.quantity,
        valueMillicents: pool.value.toString(),
      };
    })
    .filter(Boolean);
}
