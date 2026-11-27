// M4 SALES-016: Accepted quote material demand allocation to draft Purchase Orders.
export const quoteProcurementSchema = `
CREATE TABLE _sales_quote_procurement(
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES _sales_quotes(id) ON DELETE RESTRICT,
  quote_version INTEGER NOT NULL,
  line_key TEXT NOT NULL,
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  ordered_milli INTEGER NOT NULL CHECK(ordered_milli BETWEEN 1 AND 1000000000),
  unit_cost_cents INTEGER NOT NULL CHECK(unit_cost_cents BETWEEN 0 AND 100000000),
  po_id TEXT NOT NULL,
  po_line_id TEXT NOT NULL,
  job_id TEXT REFERENCES jobs(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(quote_id,quote_version,line_key,po_line_id)
);
CREATE INDEX _sales_quote_procurement_quote ON _sales_quote_procurement(quote_id,quote_version);
CREATE TABLE _sales_quote_procurement_requests(
  request_key TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;
