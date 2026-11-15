// CRM-001 schema: contacts with roles, communication preferences and billing relationships.
//
// Additive only. The existing `customers` and `sites` tables are left exactly as they are:
//   * customers            stays the company/account record.
//   * sites.contact_name/_phone/_email  stays as the legacy "primary site contact" that the
//     equipment screens already display. It is NOT migrated or rewritten here, so no existing
//     screen changes behaviour. CRM contacts are an additional, richer record.
// Every statement is CREATE ... IF NOT EXISTS or a guarded ALTER, so re-running preserves rows.

export const crmSchema = `
CREATE TABLE IF NOT EXISTS _crm_contacts(
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  site_id TEXT REFERENCES sites(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  -- Communication preferences, stored per contact. 0 = do not use, 1 = allowed.
  -- Default 1 for email/phone (a business contact is normally reachable); SMS defaults 0
  -- because texting requires explicit consent and carrier rules.
  email_ok INTEGER NOT NULL DEFAULT 1 CHECK(email_ok IN (0,1)),
  phone_ok INTEGER NOT NULL DEFAULT 1 CHECK(phone_ok IN (0,1)),
  sms_ok INTEGER NOT NULL DEFAULT 0 CHECK(sms_ok IN (0,1)),
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS _crm_contacts_customer ON _crm_contacts(customer_id,active,name);
CREATE INDEX IF NOT EXISTS _crm_contacts_site ON _crm_contacts(site_id,active);

-- Roles are many-to-many: one contact may be both Billing and Service for a site.
CREATE TABLE IF NOT EXISTS _crm_contact_roles(
  contact_id TEXT NOT NULL REFERENCES _crm_contacts(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('billing','service','accounts_payable','site_supervisor','estimator','other')),
  PRIMARY KEY(contact_id,role)
);

-- Billing relationship: which account is invoiced for which site. Separate from the
-- owning account so a property manager can be billed for a building another entity owns.
CREATE TABLE IF NOT EXISTS _crm_billing_links(
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  billing_customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  po_required INTEGER NOT NULL DEFAULT 0 CHECK(po_required IN (0,1)),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(site_id,billing_customer_id)
);
CREATE INDEX IF NOT EXISTS _crm_billing_links_site ON _crm_billing_links(site_id);

-- Account-level CRM classification. Added to the existing customers table additively,
-- so the legacy application keeps working without knowing these columns exist.
CREATE TABLE IF NOT EXISTS _crm_account_settings(
  customer_id TEXT PRIMARY KEY REFERENCES customers(id) ON DELETE RESTRICT,
  segment TEXT NOT NULL DEFAULT 'commercial' CHECK(segment IN ('commercial','residential')),
  account_type TEXT NOT NULL DEFAULT 'customer' CHECK(account_type IN ('customer','prospect','vendor','inactive')),
  parent_customer_id TEXT REFERENCES customers(id) ON DELETE RESTRICT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS _crm_account_parent ON _crm_account_settings(parent_customer_id);

-- Audit follows the same shape as the Sales ledger so cross-module reports can read one pattern.
CREATE TABLE IF NOT EXISTS _crm_audit(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS _crm_audit_entity ON _crm_audit(entity_type,entity_id,id);
`;
