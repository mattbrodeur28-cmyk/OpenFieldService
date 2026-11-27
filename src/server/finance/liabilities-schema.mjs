export const liabilitiesSchemaV1 = `
CREATE TABLE IF NOT EXISTS _finance_supplier_bills (
  id TEXT PRIMARY KEY,
  supplier_id TEXT,
  supplier_name TEXT NOT NULL,
  purchase_order_id TEXT,
  bill_number TEXT NOT NULL,
  bill_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','partially_paid','paid','void')),
  po_matched INTEGER NOT NULL DEFAULT 0 CHECK (po_matched IN (0,1)),
  notes TEXT NOT NULL DEFAULT '',
  approved_by TEXT,
  approved_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fin_bills_status ON _finance_supplier_bills(status, due_date);
CREATE INDEX IF NOT EXISTS idx_fin_bills_po ON _finance_supplier_bills(purchase_order_id);

CREATE TABLE IF NOT EXISTS _finance_bill_payments (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL REFERENCES _finance_supplier_bills(id) ON DELETE RESTRICT,
  paid_on TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL DEFAULT 'ach' CHECK (method IN ('ach','check','wire','card','cash','other')),
  reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fin_bill_pay ON _finance_bill_payments(bill_id);

CREATE TABLE IF NOT EXISTS _finance_bill_credits (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL REFERENCES _finance_supplier_bills(id) ON DELETE RESTRICT,
  credited_on TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  reason TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fin_bill_cred ON _finance_bill_credits(bill_id);

CREATE TABLE IF NOT EXISTS _finance_permissions (
  user_id TEXT PRIMARY KEY,
  can_view_finance INTEGER NOT NULL DEFAULT 0 CHECK (can_view_finance IN (0,1)),
  can_manage_receivables INTEGER NOT NULL DEFAULT 0 CHECK (can_manage_receivables IN (0,1)),
  can_manage_liabilities INTEGER NOT NULL DEFAULT 0 CHECK (can_manage_liabilities IN (0,1)),
  can_approve_bills INTEGER NOT NULL DEFAULT 0 CHECK (can_approve_bills IN (0,1)),
  can_reconcile_accounting INTEGER NOT NULL DEFAULT 0 CHECK (can_reconcile_accounting IN (0,1)),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS _finance_liab_idempotency (
  request_key TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (request_key, actor_id)
);
`;
