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
