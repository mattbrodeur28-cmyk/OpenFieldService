// M11 shared project foundation: project structure, phases, milestones and linked jobs.
export const projectSchema = `
CREATE TABLE _projects(
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','on_hold','completed','closed')),
  project_manager TEXT NOT NULL DEFAULT '',
  planned_start TEXT NOT NULL DEFAULT '',
  planned_end TEXT NOT NULL DEFAULT '',
  actual_start TEXT NOT NULL DEFAULT '',
  actual_end TEXT NOT NULL DEFAULT '',
  source_kind TEXT,
  source_id TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _projects_customer ON _projects(customer_id,archived);
CREATE TABLE _project_phases(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES _projects(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  cost_code TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  planned_start TEXT NOT NULL DEFAULT '',
  planned_end TEXT NOT NULL DEFAULT '',
  actual_start TEXT NOT NULL DEFAULT '',
  actual_end TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX _project_phases_project ON _project_phases(project_id,position);
CREATE TABLE _project_milestones(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES _projects(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  due_date TEXT NOT NULL DEFAULT '',
  completed_at TEXT
);
CREATE INDEX _project_milestones_project ON _project_milestones(project_id,due_date);
CREATE TABLE _project_jobs(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES _projects(id) ON DELETE RESTRICT,
  job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE RESTRICT,
  phase_id TEXT REFERENCES _project_phases(id) ON DELETE RESTRICT
);
CREATE INDEX _project_jobs_project ON _project_jobs(project_id,job_id);
`;

// v2: project sites and deliverables.
export const projectSchemaV2 = `
CREATE TABLE _project_sites(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES _projects(id) ON DELETE RESTRICT,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  UNIQUE(project_id,site_id)
);
CREATE INDEX _project_sites_project ON _project_sites(project_id,site_id);
CREATE TABLE _project_deliverables(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES _projects(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  due_date TEXT NOT NULL DEFAULT '',
  completed_at TEXT
);
CREATE INDEX _project_deliverables_project ON _project_deliverables(project_id,due_date);
`;

// v3: baseline budget/schedule, phase progress, issues and phase dependencies (PROJ-002).
export const projectSchemaV3 = `
ALTER TABLE _projects ADD COLUMN baseline_cost_cents INTEGER;
ALTER TABLE _projects ADD COLUMN baseline_start TEXT NOT NULL DEFAULT '';
ALTER TABLE _projects ADD COLUMN baseline_end TEXT NOT NULL DEFAULT '';
ALTER TABLE _projects ADD COLUMN estimate_to_complete_cents INTEGER;
ALTER TABLE _projects ADD COLUMN baselined_at TEXT;
ALTER TABLE _projects ADD COLUMN baselined_by TEXT NOT NULL DEFAULT '';
ALTER TABLE _project_phases ADD COLUMN percent_complete INTEGER NOT NULL DEFAULT 0 CHECK(percent_complete BETWEEN 0 AND 100);
ALTER TABLE _project_phases ADD COLUMN progress_updated_at TEXT;
CREATE TABLE _project_issues(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES _projects(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'medium' CHECK(severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','blocked','resolved')),
  assigned_to TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);
CREATE INDEX _project_issues_project ON _project_issues(project_id,status);
CREATE TABLE _project_phase_dependencies(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES _projects(id) ON DELETE RESTRICT,
  phase_id TEXT NOT NULL REFERENCES _project_phases(id) ON DELETE RESTRICT,
  depends_on_id TEXT NOT NULL REFERENCES _project_phases(id) ON DELETE RESTRICT,
  CHECK(phase_id <> depends_on_id)
);
CREATE INDEX _project_phase_dependencies_project ON _project_phase_dependencies(project_id,phase_id);
`;

// v4: job-costing sections (PM Hours, Tech Hours, Graphics, Sales, Material, ...) for P&L.
export const projectSchemaV4 = `
CREATE TABLE _project_cost_sections(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES _projects(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  quantity_milli INTEGER NOT NULL DEFAULT 0 CHECK(quantity_milli>=0),
  cost_rate_cents INTEGER NOT NULL DEFAULT 0 CHECK(cost_rate_cents>=0),
  bill_rate_cents INTEGER NOT NULL DEFAULT 0 CHECK(bill_rate_cents>=0),
  UNIQUE(project_id,name)
);
CREATE INDEX _project_cost_sections_project ON _project_cost_sections(project_id,position);
`;

// v5: project track/contract/retainage, immutable audit trail (PROJ-009), and field documentation (PROJ-003).
export const projectSchemaV5 = `
ALTER TABLE _projects ADD COLUMN track TEXT NOT NULL DEFAULT 'commercial' CHECK(track IN ('commercial','construction','service'));
ALTER TABLE _projects ADD COLUMN contract_value_cents INTEGER NOT NULL DEFAULT 0 CHECK(contract_value_cents>=0);
ALTER TABLE _projects ADD COLUMN retainage_bps INTEGER NOT NULL DEFAULT 1000 CHECK(retainage_bps BETWEEN 0 AND 5000);
CREATE TABLE _project_audit(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES _projects(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT NOT NULL DEFAULT '{}',
  after_json TEXT NOT NULL DEFAULT '{}',
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _project_audit_project ON _project_audit(project_id,id DESC);
CREATE TRIGGER _project_audit_no_update BEFORE UPDATE ON _project_audit BEGIN SELECT RAISE(ABORT,'PROJECT_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER _project_audit_no_delete BEFORE DELETE ON _project_audit BEGIN SELECT RAISE(ABORT,'PROJECT_AUDIT_IMMUTABLE'); END;
CREATE TABLE _project_field_docs(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES _projects(id) ON DELETE RESTRICT,
  phase_id TEXT REFERENCES _project_phases(id) ON DELETE RESTRICT,
  job_id TEXT REFERENCES jobs(id) ON DELETE RESTRICT,
  doc_type TEXT NOT NULL CHECK(doc_type IN ('daily_log','photo','form','signature','completion_evidence','attachment')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  document_id TEXT,
  billing_required INTEGER NOT NULL DEFAULT 0 CHECK(billing_required IN (0,1)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','rejected')),
  signature_name TEXT NOT NULL DEFAULT '',
  signature_intent TEXT NOT NULL DEFAULT '',
  signed_at TEXT,
  author_id TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _project_field_docs_project ON _project_field_docs(project_id,doc_type,created_at DESC);
`;

// v6: crew management & field time (PROJ-004) and change orders (PROJ-005).
export const projectSchemaV6 = `
CREATE TABLE _project_crews(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES _projects(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  lead_technician_id TEXT REFERENCES technicians(id) ON DELETE RESTRICT,
  cost_code TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _project_crews_project ON _project_crews(project_id,active);
CREATE TABLE _project_crew_members(
  id TEXT PRIMARY KEY,
  crew_id TEXT NOT NULL REFERENCES _project_crews(id) ON DELETE RESTRICT,
  project_id TEXT NOT NULL REFERENCES _projects(id) ON DELETE RESTRICT,
  technician_id TEXT NOT NULL REFERENCES technicians(id) ON DELETE RESTRICT,
  role TEXT NOT NULL DEFAULT 'technician',
  effective_from TEXT NOT NULL,
  effective_to TEXT NOT NULL DEFAULT '',
  hourly_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(hourly_cost_cents>=0),
  hourly_bill_cents INTEGER NOT NULL DEFAULT 0 CHECK(hourly_bill_cents>=0)
);
CREATE INDEX _project_crew_members_crew ON _project_crew_members(crew_id,technician_id);
CREATE TABLE _project_crew_time(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES _projects(id) ON DELETE RESTRICT,
  crew_id TEXT REFERENCES _project_crews(id) ON DELETE RESTRICT,
  technician_id TEXT NOT NULL REFERENCES technicians(id) ON DELETE RESTRICT,
  job_id TEXT REFERENCES jobs(id) ON DELETE RESTRICT,
  phase_id TEXT REFERENCES _project_phases(id) ON DELETE RESTRICT,
  cost_code TEXT NOT NULL DEFAULT '',
  work_date TEXT NOT NULL,
  hours_milli INTEGER NOT NULL CHECK(hours_milli BETWEEN 1 AND 24000),
  hourly_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(hourly_cost_cents>=0),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('draft','submitted','approved','rejected')),
  notes TEXT NOT NULL DEFAULT '',
  submitted_by TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  correction_of TEXT REFERENCES _project_crew_time(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _project_crew_time_project ON _project_crew_time(project_id,work_date DESC);
CREATE TABLE _project_change_orders(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES _projects(id) ON DELETE RESTRICT,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  phase_id TEXT REFERENCES _project_phases(id) ON DELETE RESTRICT,
  cost_code TEXT NOT NULL DEFAULT '',
  labor_cost_cents INTEGER NOT NULL DEFAULT 0,
  material_cost_cents INTEGER NOT NULL DEFAULT 0,
  subcontract_cost_cents INTEGER NOT NULL DEFAULT 0,
  price_cents INTEGER NOT NULL DEFAULT 0,
  schedule_impact_days INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','rejected')),
  customer_accepted INTEGER NOT NULL DEFAULT 0 CHECK(customer_accepted IN (0,1)),
  customer_accepted_by TEXT NOT NULL DEFAULT '',
  customer_accepted_at TEXT,
  submitted_by TEXT,
  approved_by TEXT,
  approved_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id,number)
);
CREATE INDEX _project_change_orders_project ON _project_change_orders(project_id,number);
`;

// v7: project purchasing/commitments (PROJ-006) and subcontractors (PROJ-007).
export const projectSchemaV7 = `
CREATE TABLE _project_purchasing_links(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES _projects(id) ON DELETE RESTRICT,
  phase_id TEXT REFERENCES _project_phases(id) ON DELETE RESTRICT,
  cost_code TEXT NOT NULL DEFAULT '',
  order_id TEXT,
  line_id TEXT,
  description TEXT NOT NULL,
  committed_cents INTEGER NOT NULL DEFAULT 0 CHECK(committed_cents>=0),
  received_cents INTEGER NOT NULL DEFAULT 0 CHECK(received_cents>=0),
  billed_cents INTEGER NOT NULL DEFAULT 0 CHECK(billed_cents>=0),
  status TEXT NOT NULL DEFAULT 'requisition' CHECK(status IN ('requisition','committed','received','billed','cancelled')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _project_purchasing_project ON _project_purchasing_links(project_id,status);
CREATE TABLE _project_subcontractors(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES _projects(id) ON DELETE RESTRICT,
  supplier_id TEXT,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT '',
  phase_id TEXT REFERENCES _project_phases(id) ON DELETE RESTRICT,
  cost_code TEXT NOT NULL DEFAULT '',
  commitment_cents INTEGER NOT NULL DEFAULT 0 CHECK(commitment_cents>=0),
  retainage_bps INTEGER NOT NULL DEFAULT 1000 CHECK(retainage_bps BETWEEN 0 AND 5000),
  coi_expiry TEXT NOT NULL DEFAULT '',
  license_expiry TEXT NOT NULL DEFAULT '',
  w9_on_file INTEGER NOT NULL DEFAULT 0 CHECK(w9_on_file IN (0,1)),
  status TEXT NOT NULL DEFAULT 'onboarding' CHECK(status IN ('onboarding','active','complete','terminated')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _project_subcontractors_project ON _project_subcontractors(project_id,status);
CREATE TABLE _project_sub_change_orders(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES _projects(id) ON DELETE RESTRICT,
  subcontractor_id TEXT NOT NULL REFERENCES _project_subcontractors(id) ON DELETE RESTRICT,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','rejected')),
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(subcontractor_id,number)
);
CREATE TABLE _project_sub_invoices(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES _projects(id) ON DELETE RESTRICT,
  subcontractor_id TEXT NOT NULL REFERENCES _project_subcontractors(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL,
  period_end TEXT NOT NULL DEFAULT '',
  gross_cents INTEGER NOT NULL CHECK(gross_cents>0),
  retainage_cents INTEGER NOT NULL DEFAULT 0 CHECK(retainage_cents>=0 AND retainage_cents<=gross_cents),
  net_cents INTEGER NOT NULL CHECK(net_cents=gross_cents-retainage_cents),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','approved','rejected')),
  approved_by TEXT,
  approved_at TEXT,
  accounting_ref TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(subcontractor_id,invoice_number)
);
CREATE INDEX _project_sub_invoices_project ON _project_sub_invoices(project_id,subcontractor_id);
`;

// v8: Schedule of Values, progress billing applications (COM/CONST-001..003), and WIP snapshots (PROJ-008).
export const projectSchemaV8 = `
CREATE TABLE _project_sov_lines(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES _projects(id) ON DELETE RESTRICT,
  phase_id TEXT REFERENCES _project_phases(id) ON DELETE RESTRICT,
  cost_code TEXT NOT NULL DEFAULT '',
  item_number TEXT NOT NULL,
  description TEXT NOT NULL,
  scheduled_value_cents INTEGER NOT NULL CHECK(scheduled_value_cents>=0),
  change_order_id TEXT UNIQUE REFERENCES _project_change_orders(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(project_id,item_number)
);
CREATE INDEX _project_sov_project ON _project_sov_lines(project_id,position);
CREATE TABLE _project_billing_apps(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES _projects(id) ON DELETE RESTRICT,
  application_number INTEGER NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','in_review','submitted','returned','approved')),
  retainage_bps INTEGER NOT NULL DEFAULT 1000 CHECK(retainage_bps BETWEEN 0 AND 5000),
  original_contract_cents INTEGER NOT NULL DEFAULT 0,
  approved_changes_cents INTEGER NOT NULL DEFAULT 0,
  contract_to_date_cents INTEGER NOT NULL DEFAULT 0,
  total_completed_stored_cents INTEGER NOT NULL DEFAULT 0,
  retainage_held_cents INTEGER NOT NULL DEFAULT 0,
  total_earned_less_retainage_cents INTEGER NOT NULL DEFAULT 0,
  previous_certificates_cents INTEGER NOT NULL DEFAULT 0,
  current_payment_due_cents INTEGER NOT NULL DEFAULT 0,
  balance_to_finish_cents INTEGER NOT NULL DEFAULT 0,
  submitted_by TEXT,
  submitted_at TEXT,
  certified_by TEXT,
  certified_at TEXT,
  invoice_id TEXT,
  payment_recorded_cents INTEGER NOT NULL DEFAULT 0 CHECK(payment_recorded_cents>=0),
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id,application_number)
);
CREATE INDEX _project_billing_apps_project ON _project_billing_apps(project_id,application_number DESC);
CREATE TABLE _project_billing_app_lines(
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES _project_billing_apps(id) ON DELETE RESTRICT,
  sov_line_id TEXT NOT NULL REFERENCES _project_sov_lines(id) ON DELETE RESTRICT,
  scheduled_value_cents INTEGER NOT NULL,
  previous_work_cents INTEGER NOT NULL DEFAULT 0 CHECK(previous_work_cents>=0),
  current_work_cents INTEGER NOT NULL DEFAULT 0 CHECK(current_work_cents>=0),
  materials_stored_cents INTEGER NOT NULL DEFAULT 0 CHECK(materials_stored_cents>=0),
  total_completed_stored_cents INTEGER NOT NULL DEFAULT 0 CHECK(total_completed_stored_cents>=0),
  retainage_cents INTEGER NOT NULL DEFAULT 0 CHECK(retainage_cents>=0),
  balance_to_finish_cents INTEGER NOT NULL DEFAULT 0,
  UNIQUE(application_id,sov_line_id)
);
CREATE TABLE _project_wip_snapshots(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES _projects(id) ON DELETE RESTRICT,
  as_of_date TEXT NOT NULL,
  method TEXT NOT NULL CHECK(method IN ('cost_to_cost','phase_progress')),
  contract_value_cents INTEGER NOT NULL,
  approved_changes_cents INTEGER NOT NULL,
  revised_contract_cents INTEGER NOT NULL,
  percent_complete_bps INTEGER NOT NULL CHECK(percent_complete_bps BETWEEN 0 AND 10000),
  earned_revenue_cents INTEGER NOT NULL,
  actual_cost_cents INTEGER NOT NULL,
  committed_cost_cents INTEGER NOT NULL,
  estimate_to_complete_cents INTEGER NOT NULL,
  forecast_at_completion_cents INTEGER NOT NULL,
  billed_to_date_cents INTEGER NOT NULL,
  over_under_billing_cents INTEGER NOT NULL,
  retainage_held_cents INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  correction_of TEXT REFERENCES _project_wip_snapshots(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _project_wip_snapshots_project ON _project_wip_snapshots(project_id,as_of_date DESC,created_at DESC);
CREATE TRIGGER _project_wip_no_update BEFORE UPDATE ON _project_wip_snapshots BEGIN SELECT RAISE(ABORT,'PROJECT_WIP_IMMUTABLE'); END;
CREATE TRIGGER _project_wip_no_delete BEFORE DELETE ON _project_wip_snapshots BEGIN SELECT RAISE(ABORT,'PROJECT_WIP_IMMUTABLE'); END;
`;
