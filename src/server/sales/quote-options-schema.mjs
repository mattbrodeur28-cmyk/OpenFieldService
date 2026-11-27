// M4 SALES-007 / CRM-005: Multiple customer-facing quote options (Good/Better/Best / Alternates).
export const quoteOptionsSchema = `
CREATE TABLE _sales_quote_options(
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES _sales_quotes(id) ON DELETE RESTRICT,
  label TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  recommended INTEGER NOT NULL DEFAULT 0 CHECK(recommended IN (0,1)),
  position INTEGER NOT NULL DEFAULT 0,
  items_json TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL CHECK(subtotal_cents>=0),
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK(tax_cents>=0),
  total_cents INTEGER NOT NULL CHECK(total_cents=subtotal_cents+tax_cents),
  selected INTEGER NOT NULL DEFAULT 0 CHECK(selected IN (0,1)),
  selected_by TEXT,
  selected_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(quote_id,label)
);
CREATE INDEX _sales_quote_options_quote ON _sales_quote_options(quote_id,position,id);
CREATE TABLE _sales_quote_option_requests(
  request_key TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;
