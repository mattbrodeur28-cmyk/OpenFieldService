// M12 Residential service business over shared native customers, sites, assets, jobs and invoices.
export const residentialSchema = `
CREATE TABLE _res_membership_plans(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('monthly','quarterly','annual')),
  price_cents INTEGER NOT NULL CHECK(price_cents>=0),
  visits_per_year INTEGER NOT NULL DEFAULT 2 CHECK(visits_per_year BETWEEN 0 AND 24),
  discount_bps INTEGER NOT NULL DEFAULT 1000 CHECK(discount_bps BETWEEN 0 AND 5000),
  benefits_text TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE _res_memberships(
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  site_id TEXT REFERENCES sites(id) ON DELETE RESTRICT,
  asset_id TEXT REFERENCES assets(id) ON DELETE RESTRICT,
  agreement_id TEXT,
  plan_id TEXT NOT NULL REFERENCES _res_membership_plans(id) ON DELETE RESTRICT,
  plan_name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK(price_cents>=0),
  discount_bps INTEGER NOT NULL DEFAULT 0 CHECK(discount_bps BETWEEN 0 AND 5000),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('pending','active','payment_failed','expired','cancelled')),
  starts_on TEXT NOT NULL,
  renewal_date TEXT NOT NULL,
  auto_renew_authorized INTEGER NOT NULL DEFAULT 0 CHECK(auto_renew_authorized IN (0,1)),
  authorized_by TEXT NOT NULL DEFAULT '',
  authorized_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _res_memberships_customer ON _res_memberships(customer_id,status);

CREATE TABLE _res_pricebook_items(
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'service',
  description TEXT NOT NULL DEFAULT '',
  unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents>=0),
  member_discount_eligible INTEGER NOT NULL DEFAULT 1 CHECK(member_discount_eligible IN (0,1)),
  taxable INTEGER NOT NULL DEFAULT 1 CHECK(taxable IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE _res_estimates(
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  site_id TEXT REFERENCES sites(id) ON DELETE RESTRICT,
  asset_id TEXT REFERENCES assets(id) ON DELETE RESTRICT,
  job_id TEXT REFERENCES jobs(id) ON DELETE RESTRICT,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  options_json TEXT NOT NULL,
  chosen_tier TEXT CHECK(chosen_tier IS NULL OR chosen_tier IN ('good','better','best')),
  accepted_total_cents INTEGER,
  accepted_by TEXT NOT NULL DEFAULT '',
  accepted_at TEXT,
  status TEXT NOT NULL DEFAULT 'presented' CHECK(status IN ('draft','presented','accepted','declined','converted')),
  created_by TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _res_estimates_customer ON _res_estimates(customer_id,status);

CREATE TABLE _res_bookings(
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  site_id TEXT REFERENCES sites(id) ON DELETE RESTRICT,
  asset_id TEXT REFERENCES assets(id) ON DELETE RESTRICT,
  channel TEXT NOT NULL DEFAULT 'phone' CHECK(channel IN ('phone','online','after_hours','ai_assisted')),
  issue TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK(urgency IN ('normal','high','urgent','emergency')),
  preferred_date TEXT NOT NULL,
  preferred_window TEXT NOT NULL DEFAULT 'morning',
  escalated INTEGER NOT NULL DEFAULT 0 CHECK(escalated IN (0,1)),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','escalated','dispatched','cancelled')),
  job_id TEXT REFERENCES jobs(id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _res_bookings_status ON _res_bookings(status,preferred_date);

CREATE TABLE _res_payment_intents(
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL DEFAULT 'manual_terminal',
  provider_token_ref TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
  status TEXT NOT NULL CHECK(status IN ('pending','succeeded','declined','partially_paid','refunded')),
  notes TEXT NOT NULL DEFAULT '',
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _res_payment_intents_invoice ON _res_payment_intents(invoice_id,created_at DESC);

CREATE TABLE _res_financing_referrals(
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  estimate_id TEXT REFERENCES _res_estimates(id) ON DELETE RESTRICT,
  provider_name TEXT NOT NULL,
  requested_cents INTEGER NOT NULL CHECK(requested_cents>0),
  external_ref TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'referred' CHECK(status IN ('referred','pending_provider','approved_by_provider','declined_by_provider','withdrawn')),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE _res_requests(
  request_key TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;
