import { proportional, fail } from "./domain.mjs";

// Quantities are location-specific; one exact value pool covers company stock.
// BigInt prevents floating-point drift in purchase costs and partial issues.
export function companyStock(db, materialId) {
  const rows = db.prepare("SELECT * FROM _inventory_balances WHERE material_id=? ORDER BY location_id").all(materialId);
  const quantity = rows.reduce((n, row) => n + row.quantity_milli, 0);
  if (!Number.isSafeInteger(quantity)) fail("Company quantity exceeds the supported inventory scope.", 422);
  return {
    rows,
    quantity,
    value: rows.reduce((n, row) => n + BigInt(row.value_millicents), 0n),
  };
}

// Called inside the movement transaction, before any projection is persisted.
// Cumulative allocation gives a deterministic remainder and conserves every
// millicent. Repricing other locations changes their optimistic-lock version.
export function allocateCompanyValue(pool, legs, nextValue) {
  const before = pool.rows.map((row) => ({ ...row }));
  const rows = new Map(before.map((row) => [row.location_id, { ...row }]));
  for (const leg of legs) rows.set(leg.after.location_id, { ...leg.after });
  const ordered = [...rows.values()].sort((a, b) => a.location_id.localeCompare(b.location_id));
  const total = ordered.reduce((n, row) => n + row.quantity_milli, 0);
  if (!Number.isSafeInteger(total)) fail("Company quantity exceeds the supported inventory scope.", 422);
  if (nextValue < 0n || (!total && nextValue !== 0n))
    fail("Company stock value does not reconcile. Review this correction.", 409);
  let cumulative = 0, allocated = 0n;
  const extra = [];
  for (const row of ordered) {
    cumulative += row.quantity_milli;
    const through = total ? proportional(nextValue, cumulative, total) : 0n;
    row.value_millicents = (through - allocated).toString();
    allocated = through;
    const leg = legs.find((entry) => entry.after.location_id === row.location_id);
    if (leg) {
      leg.after.value_millicents = row.value_millicents;
      // Includes this location's share of the company-wide cost revaluation.
      leg.value = (BigInt(row.value_millicents) - BigInt(leg.before.value_millicents)).toString();
    } else {
      const old = before.find((entry) => entry.location_id === row.location_id);
      if (old.value_millicents !== row.value_millicents) {
        row.version += 1;
        extra.push(row);
      }
    }
  }
  return { before, after: ordered, extra };
}
