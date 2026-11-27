// M8: Business owner saved reports (BIZ-005), automations (BIZ-006), and customer portal tokens (BIZ-007).
export const businessSchema = `
CREATE TABLE _biz_saved_reports(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dataset TEXT NOT NULL CHECK(dataset IN ('invoices','jobs','opportunities','inventory','labor','projects','residential')),
  filters_json TEXT NOT NULL DEFAULT '{}',
  schedule TEXT NOT NULL DEFAULT 'manual' CHECK(schedule IN ('manual','daily','weekly','monthly')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE _biz_automations(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  trigger_kind TEXT NOT NULL CHECK(trigger_kind IN ('invoice_overdue','agreement_renewal_due','inventory_low_stock','job_unassigned','booking_urgent')),
  action_kind TEXT NOT NULL CHECK(action_kind IN ('create_task','notify_owner','flag_review')),
  config_json TEXT NOT NULL DEFAULT '{}',
  requires_approval INTEGER NOT NULL DEFAULT 1 CHECK(requires_approval IN (0,1)),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE _biz_automation_runs(
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL REFERENCES _biz_automations(id) ON DELETE RESTRICT,
  mode TEXT NOT NULL CHECK(mode IN ('dry_run','executed')),
  matched_count INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT NOT NULL DEFAULT '{}',
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _biz_automation_runs_auto ON _biz_automation_runs(automation_id,created_at DESC);
CREATE TABLE _portal_tokens(
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL DEFAULT '["quotes","agreements","reports","invoices"]',
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _portal_tokens_customer ON _portal_tokens(customer_id,revoked_at);
`;
