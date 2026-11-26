# Projects API (M11)

2026-11-26. The shared project foundation (`/api/projects`). Owner/Admin/Member may
write; all active users read. Writes are CSRF-guarded and use actor-bound, content-bound
idempotent request keys.

- `GET /api/projects` — list active projects (paged; `?customerId=` filter).
- `POST /api/projects` — create/update a project (versioned, `expectedVersion`).
- `GET /api/projects/:id` — detail with phases, milestones and linked jobs.
- `POST /api/projects/:id/phases` — create/update a phase (name, cost code, owner,
  planned/actual dates, position).
- `POST /api/projects/:id/milestones` — create/update a milestone and record completion.
- `POST /api/projects/:id/jobs` — link a job (must belong to the project's customer;
  optional phase). `DELETE /api/projects/:id/jobs/:linkId` unlinks.

Storage: `_projects`, `_project_phases`, `_project_milestones`, `_project_jobs`
(migration v1). A job may belong to at most one project; a job's customer must match the
project's customer.

## PROJ-002: project management

2026-11-26. `POST /api/projects/:id/baseline` records a versioned baseline budget and
schedule (baseline cost, start/end, estimate-to-complete) with `baselined_at/by`.
Phases carry `percentComplete` progress. `POST /api/projects/:id/issues` upserts issues
(severity/status/assignee/due/resolved) and `POST /api/projects/:id/dependencies`
records phase dependencies. Committed/actual cost aggregation and overdue actions are
follow-up work.
