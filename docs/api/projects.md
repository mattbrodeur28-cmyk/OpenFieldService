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
