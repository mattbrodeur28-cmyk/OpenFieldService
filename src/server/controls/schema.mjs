export const controlsSchemaV1 = `
CREATE TABLE IF NOT EXISTS _ctrl_systems (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  site_name TEXT NOT NULL DEFAULT '',
  building_name TEXT NOT NULL,
  system_name TEXT NOT NULL,
  system_type TEXT NOT NULL DEFAULT 'hvac_bas',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','commissioning','decommissioned')),
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ctrl_sys_cust ON _ctrl_systems(customer_id);

CREATE TABLE IF NOT EXISTS _ctrl_controllers (
  id TEXT PRIMARY KEY,
  system_id TEXT NOT NULL REFERENCES _ctrl_systems(id) ON DELETE RESTRICT,
  asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  tag TEXT NOT NULL,
  manufacturer TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  protocol TEXT NOT NULL DEFAULT 'BACnet/IP' CHECK (protocol IN ('BACnet/IP','BACnet/MSTP','Modbus TCP','Modbus RTU','LonWorks','Proprietary')),
  network_address TEXT NOT NULL DEFAULT '',
  device_instance TEXT NOT NULL DEFAULT '',
  point_count INTEGER NOT NULL DEFAULT 0,
  firmware_version TEXT NOT NULL DEFAULT '',
  software_version TEXT NOT NULL DEFAULT '',
  secret_ref TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','commissioning','replaced','retired')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ctrl_ctrl_sys ON _ctrl_controllers(system_id);

CREATE TABLE IF NOT EXISTS _ctrl_history (
  id TEXT PRIMARY KEY,
  controller_id TEXT NOT NULL REFERENCES _ctrl_controllers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('installed','moved','replaced','firmware_updated')),
  from_location TEXT NOT NULL DEFAULT '',
  to_location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ctrl_hist_ctrl ON _ctrl_history(controller_id, created_at);

CREATE TABLE IF NOT EXISTS _ctrl_checkouts (
  id TEXT PRIMARY KEY,
  controller_id TEXT NOT NULL REFERENCES _ctrl_controllers(id) ON DELETE RESTRICT,
  job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  template_version TEXT NOT NULL DEFAULT 'v1.0',
  test_type TEXT NOT NULL DEFAULT 'point_to_point' CHECK (test_type IN ('point_to_point','sequence_of_ops','functional_test','trend_review')),
  readings_json TEXT NOT NULL DEFAULT '[]',
  evidence_notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','approved','rejected')),
  technician_id TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  signoff_notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ctrl_chk_ctrl ON _ctrl_checkouts(controller_id, created_at);

CREATE TABLE IF NOT EXISTS _ctrl_artifacts (
  id TEXT PRIMARY KEY,
  system_id TEXT NOT NULL REFERENCES _ctrl_systems(id) ON DELETE RESTRICT,
  controller_id TEXT REFERENCES _ctrl_controllers(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('drawing','backup','sequence_doc','submittal')),
  filename TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  sha256 TEXT NOT NULL,
  provenance TEXT NOT NULL DEFAULT '',
  retention_policy TEXT NOT NULL DEFAULT '7_years',
  storage_ref TEXT NOT NULL DEFAULT '',
  approved INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0,1)),
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ctrl_art_sys ON _ctrl_artifacts(system_id, created_at);

CREATE TABLE IF NOT EXISTS _ctrl_deficiencies (
  id TEXT PRIMARY KEY,
  system_id TEXT NOT NULL REFERENCES _ctrl_systems(id) ON DELETE RESTRICT,
  controller_id TEXT REFERENCES _ctrl_controllers(id) ON DELETE SET NULL,
  checkout_id TEXT REFERENCES _ctrl_checkouts(id) ON DELETE SET NULL,
  severity TEXT NOT NULL DEFAULT 'major' CHECK (severity IN ('critical','major','minor','observation')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  evidence_ref TEXT NOT NULL DEFAULT '',
  owner_name TEXT NOT NULL DEFAULT '',
  corrective_job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','retest_pending','closed')),
  retest_notes TEXT NOT NULL DEFAULT '',
  closed_by TEXT,
  closed_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ctrl_def_sys ON _ctrl_deficiencies(system_id, status);

CREATE TABLE IF NOT EXISTS _ctrl_maint_links (
  id TEXT PRIMARY KEY,
  controller_id TEXT NOT NULL REFERENCES _ctrl_controllers(id) ON DELETE RESTRICT,
  job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  template_name TEXT NOT NULL,
  template_version TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  completed_by TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ctrl_maint_ctrl ON _ctrl_maint_links(controller_id, completed_at);

CREATE TABLE IF NOT EXISTS _ctrl_idempotency (
  request_key TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (request_key, actor_id)
);
`;
