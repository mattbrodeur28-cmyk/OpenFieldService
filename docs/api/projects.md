# Projects API (M11 — Commercial & Construction)

Shared project foundation supporting Commercial, Construction, and Service tracks over native Customers, Sites, Jobs, Technicians, Purchasing orders, and Documents.

## Permissions & Safeguards
- **Read (`GET`)**: Any active authenticated user (`owner`, `admin`, `member`, `viewer`).
- **Write (`POST`/`DELETE`)**: `owner`, `admin`, `member` (with `X-Requested-With: OpenFieldService` and idempotent `requestKey`).
- **Financial & operational approvals**: `owner` or `admin` only (field doc approval, crew time review, change order approve/reject/customer acceptance, subcontractor change order approval, subcontractor invoice review, billing application approve/return/record payment, WIP period snapshot lock).
- **Immutability**: `_project_audit` and `_project_wip_snapshots` enforce append-only immutability via SQLite triggers.

## Endpoints (`/api/projects`)

### Core Structure (`PROJ-001`, `PROJ-002`)
- `GET /` — List active projects (paginated, optional `customerId`).
- `POST /` — Create or update a versioned project (`track`, `contractValueCents`, `retainageBps`, dates, PM, status).
- `POST /from-proposal` — Convert an accepted Sales proposal into a project without re-entering scope.
- `GET /:id` — Full project workspace payload (phases, milestones, deliverables, jobs, sites, issues, dependencies, cost sections/P&L, field docs, billing readiness, crews, crew time, change orders, purchasing, subcontractors, SOV lines, billing apps, live WIP, WIP snapshots).
- `POST /:id/phases`, `POST /:id/milestones`, `POST /:id/deliverables`, `POST /:id/baseline`, `POST /:id/issues`, `POST /:id/dependencies`
- `POST /:id/jobs`, `DELETE /:id/jobs/:linkId`, `POST /:id/sites`, `DELETE /:id/sites/:linkId`
- `POST /:id/cost-sections`, `DELETE /:id/cost-sections/:sectionId`

### Field Documentation (`PROJ-003`)
- `POST /:id/field-docs` — Create/update/approve daily logs, forms, photos, completion evidence, attachments, or explicit approval signatures (`signatureName` + `signatureIntent` required for `signature`). Setting `billingRequired: true` gates billing application submission until approved.

### Crews & Field Time (`PROJ-004`)
- `POST /:id/crews` — Create/update project crew with lead technician and cost code.
- `POST /:id/crews/:crewId/members` — Effective-dated technician membership with hourly cost/bill rates.
- `POST /:id/crew-time` — Submit field time (or correction referencing `correctionOf`) by technician, job, phase, and cost code.
- `POST /:id/crew-time/:timeId/review` — Owner/Admin approve or reject submitted time.

### Change Orders (`PROJ-005`)
- `POST /:id/change-orders` — Create/edit draft change order (labor/material/subcontract cost, contract price, schedule impact days).
- `POST /:id/change-orders/:coId/action` — Transition `submit` | `approve` | `reject` | `customer_accept`. Only approved change orders affect revised contract value and SOV eligibility.

### Purchasing & Subcontractors (`PROJ-006`, `PROJ-007`)
- `POST /:id/purchasing` — Record project/phase/cost-code requisition or commitment (committed/received/billed). Native `_purch_lines` linked to project jobs are automatically projected without double-counting open commitments.
- `POST /:id/subcontractors` — Create/update subcontractor package with commitment, retainage bps, W-9, COI/license expiry compliance warnings.
- `POST /:id/subcontractors/:subId/change-orders` — Record subcontractor change order.
- `POST /:id/subcontractors/:subId/invoices` — Submit subcontractor invoice (gross, retainage, net, accounting reference).
- `POST /:id/sub-invoices/:invId/review` — Owner/Admin approve or reject subcontractor invoice.

### Schedule of Values & Progress Billing (`COM-001..003`, `CONST-001..003`)
- `POST /:id/sov` — Create/update Schedule of Values line (original contract or linked approved change order).
- `POST /:id/billing-apps` — Create sequential draft billing application; enforces cumulative `previous + current + stored <= scheduledValue`, calculates retainage and current payment due, and freezes snapshot JSON.
- `POST /:id/billing-apps/:appId/action` — Transition `review` | `submit` (enforces `billingReadiness`) | `return` | `approve` | `record_payment`.
- `GET /:id/billing-apps/:appId/export` — Render internal progress billing application & continuation sheet HTML from the frozen snapshot (explicitly labeled as an internal format, not a licensed AIA-branded form).

### WIP Reporting & Audit (`PROJ-008`, `PROJ-009`)
- `GET /:id/wip?method=cost_to_cost|phase_progress` — Live operational WIP calculation with explicit source breakdown and freshness timestamp.
- `POST /:id/wip/snapshots` — Owner/Admin lock an immutable period WIP snapshot (supports `correctionOf`).
- `GET /:id/audit` — Read immutable project audit log.
