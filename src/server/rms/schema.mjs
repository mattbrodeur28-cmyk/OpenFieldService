// M14 Refrigerant Monitoring System (RMS) over native customers, assets, jobs, technicians and inventory locations.
export const rmsSchema = `
CREATE TABLE _rms_rules(
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  jurisdiction TEXT NOT NULL DEFAULT 'US-EPA-608',
  effective_date TEXT NOT NULL,
  equipment_class TEXT NOT NULL CHECK(equipment_class IN ('comfort_cooling','commercial_refrigeration','industrial_process','other')),
  charge_threshold_tenths_oz INTEGER NOT NULL CHECK(charge_threshold_tenths_oz>=0),
  max_leak_rate_bps INTEGER NOT NULL CHECK(max_leak_rate_bps BETWEEN 1 AND 10000),
  repair_deadline_days INTEGER NOT NULL DEFAULT 30 CHECK(repair_deadline_days BETWEEN 1 AND 365),
  source_url TEXT NOT NULL DEFAULT 'https://www.epa.gov/section608/recordkeeping-and-reporting-requirements-stationary-refrigeration',
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(code,version)
);

CREATE TABLE _rms_refrigerants(
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  gwp INTEGER NOT NULL DEFAULT 0 CHECK(gwp>=0),
  ozone_depleting INTEGER NOT NULL DEFAULT 0 CHECK(ozone_depleting IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);

CREATE TABLE _rms_cylinders(
  id TEXT PRIMARY KEY,
  tag TEXT NOT NULL UNIQUE COLLATE NOCASE,
  refrigerant_id TEXT NOT NULL REFERENCES _rms_refrigerants(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'virgin' CHECK(status IN ('virgin','recovered','reclaimed','empty','retired')),
  tare_tenths_oz INTEGER NOT NULL DEFAULT 0 CHECK(tare_tenths_oz>=0),
  capacity_tenths_oz INTEGER NOT NULL CHECK(capacity_tenths_oz>0),
  current_mass_tenths_oz INTEGER NOT NULL DEFAULT 0 CHECK(current_mass_tenths_oz BETWEEN 0 AND capacity_tenths_oz),
  location_id TEXT,
  technician_id TEXT REFERENCES technicians(id) ON DELETE RESTRICT,
  certification_ref TEXT NOT NULL DEFAULT '',
  supplier_doc_ref TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _rms_cylinders_ref ON _rms_cylinders(refrigerant_id,status);

CREATE TABLE _rms_equipment_baselines(
  asset_id TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE RESTRICT,
  refrigerant_id TEXT NOT NULL REFERENCES _rms_refrigerants(id) ON DELETE RESTRICT,
  full_charge_tenths_oz INTEGER CHECK(full_charge_tenths_oz IS NULL OR full_charge_tenths_oz>0),
  circuit_name TEXT NOT NULL DEFAULT 'Primary',
  equipment_class TEXT NOT NULL DEFAULT 'comfort_cooling' CHECK(equipment_class IN ('comfort_cooling','commercial_refrigeration','industrial_process','other')),
  verified_source TEXT NOT NULL DEFAULT '',
  verified_date TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE _rms_events(
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK(event_type IN ('purchase','transfer','addition','recovery','return','reclaim','disposal','adjustment')),
  refrigerant_id TEXT NOT NULL REFERENCES _rms_refrigerants(id) ON DELETE RESTRICT,
  cylinder_id TEXT REFERENCES _rms_cylinders(id) ON DELETE RESTRICT,
  asset_id TEXT REFERENCES assets(id) ON DELETE RESTRICT,
  job_id TEXT REFERENCES jobs(id) ON DELETE RESTRICT,
  technician_id TEXT REFERENCES technicians(id) ON DELETE RESTRICT,
  location_id TEXT,
  mass_tenths_oz INTEGER NOT NULL CHECK(mass_tenths_oz>0),
  event_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence_ref TEXT NOT NULL DEFAULT '',
  certification_ref TEXT NOT NULL DEFAULT '',
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _rms_events_asset ON _rms_events(asset_id,event_at DESC);
CREATE INDEX _rms_events_cylinder ON _rms_events(cylinder_id,event_at DESC);
CREATE TRIGGER _rms_events_no_update BEFORE UPDATE ON _rms_events BEGIN SELECT RAISE(ABORT,'RMS_EVIDENCE_IMMUTABLE'); END;
CREATE TRIGGER _rms_events_no_delete BEFORE DELETE ON _rms_events BEGIN SELECT RAISE(ABORT,'RMS_EVIDENCE_IMMUTABLE'); END;

CREATE TABLE _rms_leak_inspections(
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  job_id TEXT REFERENCES jobs(id) ON DELETE RESTRICT,
  technician_id TEXT REFERENCES technicians(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK(kind IN ('inspection','repair','initial_verification','followup_verification')),
  rule_id TEXT REFERENCES _rms_rules(id) ON DELETE RESTRICT,
  calculated_leak_rate_bps INTEGER,
  passed INTEGER NOT NULL DEFAULT 1 CHECK(passed IN (0,1)),
  due_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  actor_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _rms_leak_asset ON _rms_leak_inspections(asset_id,occurred_at DESC);

CREATE TABLE _rms_requests(
  request_key TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;
