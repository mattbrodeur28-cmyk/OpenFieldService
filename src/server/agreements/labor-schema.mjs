// Additive v13: a reviewed company labor cost rate used by agreement profitability.
// A missing row means "unconfigured" (labor cost stays unknown), never free labor.
export const laborSchema = `
CREATE TABLE _agreement_labor_rates(
  id INTEGER PRIMARY KEY CHECK(id=1),
  rate_cents_per_hour INTEGER NOT NULL CHECK(rate_cents_per_hour>=0),
  version INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;
