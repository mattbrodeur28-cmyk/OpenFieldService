# Features and enterprise product roadmap

## Product direction

Build an independent, modern, self-hosted operating platform for small and medium
service businesses: CRM, field service, dispatch, equipment and controls records,
contracts, maintenance agreements, commercial/construction projects, residential
service workflows, collaboration, and QuickBooks-backed accounting.

ServiceTitan is a reference for business coverage. Salesforce Field Service is the
reference for the Dispatcher interaction: a resource-based hourly Gantt board with
an open-work pipeline. The first distinctive workflow is commercial HVAC and
controls service records and handover:

**Customer → building → equipment/controller → service visit → checkout evidence →
deficiency/corrective work → customer handover → invoice/accounting.**

Maintainability, documentation, recoverable data, clear permissions and repeatable
deployment are requirements for every feature. A complete-looking screen does not
establish that its backend or provider synchronization works.

## How we work through this file

1. Select one feature ID and confirm its acceptance criteria and dependencies.
2. Implement a usable slice: UI, API, permissions, persistence, error handling,
   meaningful tests and documentation.
3. Review migrations, operational impact and recovery before deploying.
4. Record the commit and evidence, then update status before selecting the next ID.
5. Keep decisions and release evidence in the repository, not only in chat.

Status meanings:

- **Planned:** not implemented; acceptance criteria describe intended behavior.
- **In progress:** implementation or documentation is underway; not a release claim.
- **Implemented:** committed code and relevant automated checks pass.
- **Verified live:** the deployed workflow has been exercised, including real
  provider accounts when applicable. Fixture tests are not live verification.

Checkboxes below mean the feature's acceptance criteria and documentation are
complete. They must not be checked merely because a page, endpoint or mock exists.

## Current foundation and limits

The foundation uses Node.js 24, Hono, Preact, TypeScript and SQLite, deployed with
systemd on a Debian 13 Proxmox LXC. Core service and workspace records currently use
two separate SQLite databases. The intended HTTPS origin is
`https://field.mattshomelab.net` through the user's reverse proxy/NetBird setup.

| Area | Current foundation | Important limits |
| --- | --- | --- |
| Service operations | Customers, jobs, technicians, weekly schedule, service types, materials and invoices | Not a full sales CRM, contract system or Gantt dispatcher |
| Equipment | Customer sites, serialized assets, lifecycle dates/status and retained history | No complete controller/point hierarchy or commissioning package |
| Accounts | Local login, admin-created users, Owner/Admin/Member/Viewer roles, temporary password changes and revocation | One company; no public signup or multi-tenant SaaS |
| Collaboration | Teams, membership and persistent messages | Polling; no full Teams feature set |
| AI | Ollama, OpenAI and DeepSeek configuration; text knowledge; bounded record context | Real provider use requires private configuration; no autonomous business writes |
| Builder | Reviewed frontend proposals, source hashes, non-root validation/build command | Existing frontend files only; generation is not deployment |
| Integrations | Private OAuth connections, encrypted tokens, refresh, read previews and opt-in Chat context | Google metadata/calendar/mail headers; Microsoft metadata/calendar/contacts/mail headers; HubSpot reads; LinkedIn profile only |
| Offline | Saved schedules/job packets on supported HTTPS browsers | Read-only; no offline write queue |
| Operations | Direct install, health endpoint, systemd, backups and CI | Not qualified for multiple replicas or horizontal scaling |

The navigation/profile/HR/channel refresh and conversational Builder changes are
**in progress**. They require final verification and release evidence before being
called deployed. QuickBooks integration, contracts, broader CRM, Dispatcher and
Kubernetes qualification are planned work.

## Milestone order

| Milestone | Outcome | Status | Depends on |
| --- | --- | --- | --- |
| M0 | Product inventory, documentation and delivery standards | In progress | Existing foundation |
| M1 | Navigation, profile/settings, HR, channels and conversational Builder | In progress | M0 |
| M2 | Maintainable backend boundaries and operational foundations | Planned | M0; complete M1 first |
| M3 | Salesforce-style Dispatcher app | Planned | M2 concurrency and scheduling foundation |
| M4 | Commercial CRM/customer workspace | Planned | M2; existing customers/sites |
| M5 | Contracts, maintenance agreements and renewals | Planned | M4 customer/contact model; M3 scheduling |
| M6 | QuickBooks-backed accounting | Planned | M2 reliable integration jobs/audit; M4 mappings |
| M7 | Controls records, commissioning and handover | Planned | M4; existing equipment foundation |
| M11 | Commercial/construction projects, phased billing, crews and job costing | Planned | M2–M6 shared domains; project and ledger foundations |
| M12 | Residential memberships, mobile sales/service, booking and payment workflows | Planned | M3–M6 shared domains; relevant M8 capabilities |
| M8 | Business-owner reporting and operational controls | Planned | M3–M7 business events |
| M9 | Containers, Kubernetes and scale qualification | Planned | M2 shared-state/database work |
| M10 | Optional extensions and broader SaaS | Planned | Proven core workflows |

Milestone IDs remain stable; the table describes dependencies rather than a strict
numeric execution order. M11/M12 are newly added business tracks and reuse shared
modules instead of duplicating the M3–M8 work.

Ordering can change explicitly. A narrow QuickBooks sandbox slice can precede
contracts once its mapping and reliable execution foundations exist. Architectural
boundaries must be designed before the Kubernetes milestone.

## M0 — Documentation and delivery standards

- [ ] **DOC-001 — Roadmap:** maintain this file with feature IDs, dependencies,
  acceptance criteria, status and links to completed release evidence.
- [ ] **DOC-002 — Documentation index:** link product, architecture, development,
  API, deployment, operations, security and release documentation from README.
- [ ] **DOC-003 — ADRs:** record context, options, decision, consequences, migration
  and revisit triggers for significant architectural decisions.
- [ ] **DOC-004 — Domain glossary:** define company/customer, contact, site/building,
  equipment/controller, job/work order, appointment, contract, invoice and payment.
- [ ] **DOC-005 — Delivery template:** problem, users/roles, workflow, business rules,
  data model, API, errors, migration, tests, operations and acceptance evidence.
- [ ] **DOC-006 — Release record:** commit, schema version, deployed version,
  validation performed, provider checks, migration instructions and known limits.

**Acceptance:** a new maintainer can locate setup instructions, the owning module,
API, permission rules, migration history and recovery runbook without this chat.
Documentation is reviewed with code; planned documentation is labeled accordingly.

## M1 — Modern workspace

### Navigation and account access

- [ ] **UX-001 — Apps:** keep Field Service service pages together; place App Builder
  and Knowledge in Apps and add Dispatcher when implemented. Remove duplicate
  Calendar navigation while preserving schedule bookmarks.
- [ ] **UX-002 — Profile:** clicking the bottom-left username opens a profile popup
  with name, email, role, editable display name and password management.
- [ ] **UX-003 — Settings:** move Settings into the account popup; Integrations is
  its own section, and Environment variables is restricted to Owner/Admin.
- [ ] **UX-004 — Administration:** show people administration to Owner/Admin/HR.
  HR manages ordinary users and team membership only. Owner/Admin grant HR access;
  existing administrator-promotion restrictions remain. HR cannot manage privileged
  accounts, system configuration, provider app secrets or App Builder.
- [ ] **UX-005 — Device storage:** remove the persistent online storage banner;
  move enable/clear controls to Settings. Retain compact genuine offline/read-only
  feedback so users understand when changes cannot be saved.
- [ ] **UX-006 — Accessibility:** keyboard access, focus return, Escape dismissal,
  dialog focus trapping, contrast, reduced motion and usable mobile layouts.

### Team channels

- [ ] **COLLAB-001 — Channel design:** modern header, avatars, grouped messages,
  date separators, timestamps, members panel and subtle motion.
- [ ] **COLLAB-002 — Composer:** Enter sends; Shift+Enter adds a newline. Preserve
  failed drafts and distinguish pending delivery from a saved message.
- [ ] **COLLAB-003 — Search/updates:** search recent messages, state the search limit,
  and label polling honestly. Later add pagination and streaming reconnect/resync.
- [ ] **COLLAB-004 — Access:** membership protects messages. HR can manage a roster
  without automatically reading conversations in teams they have not joined.
- [ ] **COLLAB-005 — Later collaboration:** attachments, mentions, unread counters,
  notifications, replies, retention and moderation are separate follow-on slices.

### Conversational App Builder

- [ ] **BUILD-001 — Conversations:** saved requests, assistant summaries and follow-up
  edits in the same draft thread; reopen prior drafts and start separate work.
- [ ] **BUILD-002 — File selection:** automatic relevant frontend-file selection;
  searchable manual selection under Advanced. Explain the additional AI request.
- [ ] **BUILD-003 — Cumulative drafts:** retain earlier changes and original hashes,
  allow more selected files within the supported limit, and preserve revision history.
- [ ] **BUILD-004 — Review:** line-numbered additions/removals, unchanged context,
  stale-source warnings and review acknowledgment before export.
- [ ] **BUILD-005 — Apply boundary:** generation does not edit the live checkout;
  retain non-root apply, typecheck/build validation and restoration on failure.
- [ ] **BUILD-006 — Later previews:** isolated disposable checkout/container, resource
  limits, separate preview origin and cleanup before in-browser deployment. Backend,
  schema and account-security generation require a separate reviewed design.

**Acceptance:** verify role-sensitive navigation, mobile/keyboard dialogs, real
channel persistence, HR escalation protections and cumulative builder edits.
Changed source must invalidate a draft. Never label generated code compiled or live.

## M2 — Backend maintainability and enterprise foundations

- [ ] **ARCH-001 — Domain modules:** explicit identity, collaboration, CRM, service,
  dispatch, agreements, accounting and AI responsibilities with documented ownership.
- [ ] **ARCH-002 — Application services:** thin HTTP handlers; centralized business
  operations, validation, authorization, transactions and domain events.
- [ ] **ARCH-003 — Persistence boundary:** explicit repositories/unit-of-work instead
  of global/current-request database binding; isolate SQL behind tested adapters.
- [ ] **ARCH-004 — Versioned migrations:** applied versions/checksums, deployment
  ordering, serialized migrations, populated-data fixtures and recovery procedures.
- [ ] **ARCH-005 — Shared database:** decide/document PostgreSQL support and migration
  from both SQLite databases, preserving UUIDs, relationships, histories and encrypted
  credentials. Decide whether SQLite stays supported for single-instance installs.
- [ ] **ARCH-006 — Reliable jobs:** persistent outbox/queue, idempotency, bounded
  retries, backoff, leases, dead-letter review and deliberate operator retries.
- [ ] **ARCH-007 — Concurrency:** transactional invariants and stale-version checks
  for scheduling, renewals, invoice export and credential refresh; no dependence on
  process-local locks for multi-replica correctness.
- [ ] **ARCH-008 — API contracts:** complete OpenAPI coverage, consistent errors,
  request IDs, pagination and documented compatibility/deprecation rules.
- [ ] **ARCH-009 — Audit:** actor/object/action/time/outcome/correlation for privileged
  changes and significant business events; exclude secrets and unnecessary PII.
- [ ] **ARCH-010 — File storage:** local and S3-compatible adapters, private access,
  signed downloads, limits, scanning policy, retention and restoration.
- [ ] **ARCH-011 — Configuration:** validated startup settings, environment precedence,
  secret references/rotation and encryption-key migration procedure.
- [ ] **ARCH-012 — Observability:** structured logs, metrics, worker/integration health,
  readiness/liveness, tracing hooks, alerts and operator dashboards.
- [ ] **ARCH-013 — Security:** centralized capabilities, session revocation, CSRF/CORS,
  rate limits, MFA/SSO roadmap, dependency/secret scanning and disclosure process.

**Acceptance:** business services can be tested without HTTP; migrations preserve
populated installs; retry/concurrency behavior is proven. Shared state is either
externalized or explicitly documented as single-instance.

## M3 — Dispatcher app

Reference: the supplied Salesforce Field Service Gantt screenshot.

- [ ] **DISPATCH-001 — Daily Gantt:** one row per technician, hourly header, duration-
  sized appointments, date navigation, Today, zoom, horizontal scrolling and explicit
  schedule timezone/current-time marker.
- [ ] **DISPATCH-002 — Work pipeline:** Open/Active filters, search, customer,
  location/equipment, priority, duration and assignment state. Map these labels to
  existing statuses before adding states. Distinguish jobs from appointments.
- [ ] **DISPATCH-003 — Drag assignment:** drop an open job onto a technician/time,
  snap to configured intervals, save assignment/date/time, and revert a failed drop.
- [ ] **DISPATCH-004 — Reschedule:** drag appointments across times/resources and
  adjust duration, with keyboard/form equivalents and completed/cancelled protections.
- [ ] **DISPATCH-005 — Conflicts:** enforce overlaps and stale-version checks on the
  server, transactionally. Define availability/travel rules and authorized overrides
  with reasons/audit; browser-only collision checks are insufficient.
- [ ] **DISPATCH-006 — Resources:** technician/team/territory/skill filters, active
  state and real availability. Do not fabricate breaks, utilization or travel times.
- [ ] **DISPATCH-007 — Metrics:** actual scheduled hours, unassigned counts, overlap
  warnings and workload with documented calculations.
- [ ] **DISPATCH-008 — Concurrent dispatch:** live change delivery/reconnect and tests
  for competing assignments by two dispatchers.
- [ ] **DISPATCH-009 — Accessibility:** real pointer drag, touch, keyboard assignment,
  reduced motion and a narrow-screen alternate view.
- [ ] **DISPATCH-010 — Later:** maps, geocoding, routing, travel estimates, shifts,
  breaks, skills, multi-tech and multi-visit jobs; optional provider credentials.

**Acceptance:** drag a real job, verify saved technician/date/time after reload,
reschedule it, reject overlap/stale writes from two clients, and demonstrate error
recovery and keyboard assignment. Synthetic drag tests alone are insufficient.

## M4 — Commercial CRM

- [ ] **CRM-001 — Accounts/contacts:** companies, service/billing contacts, contact
  roles, communication preferences, multiple buildings and billing relationships.
- [ ] **CRM-002 — Customer 360:** contacts, sites/equipment, jobs, communications,
  proposals, agreements, invoices and activity in one customer workspace.
- [ ] **CRM-003 — Sales pipeline:** leads/opportunities, stages, owner, estimated
  value, close date, next action and conversion into customer/site/quote.
- [ ] **CRM-004 — Activity:** tasks, follow-ups, notes, attachments and reminders;
  distinguish private internal records from customer-facing communication.
- [ ] **CRM-005 — Quotes:** versioned scope, labor/materials, options, approvals,
  expiration, acceptance and conversion into work/contracts.
- [ ] **CRM-006 — Data quality:** searchable/filterable records, validated import
  preview, duplicate/merge policy, exports and appropriate PII controls.
- [ ] **CRM-007 — Communications:** link supported mail/channel activity to customer
  records with explicit access and consent boundaries.

**Acceptance:** convert a prospect into a commercial customer with contacts and two
sites, accept a quote into work and retain its history through reload and migration.
Commercial/construction conversion into projects and residential three-option
estimates extend this model in M11/M12.

## M5 — Contracts and maintenance agreements

- [ ] **CONTRACT-001 — Contract record:** customer, covered sites/equipment, scope,
  exclusions, terms, dates, renewal policy, pricing and authoritative document.
- [ ] **CONTRACT-002 — Lifecycle:** draft/review/offered/accepted/active/renewal/
  expired/cancelled, authorized transitions and immutable accepted versions/amendments.
- [ ] **CONTRACT-003 — Maintenance plans:** equipment-specific recurring tasks,
  seasonal schedules, checklists, template versions and required evidence.
- [ ] **CONTRACT-004 — Work generation:** idempotent job creation, scheduling horizon,
  due-work preview, exceptions, holiday/timezone rules and auditable skips.
- [ ] **CONTRACT-005 — Entitlements:** included visits/hours, response priority,
  billable exceptions and coverage exhaustion with explainable decisions.
- [ ] **CONTRACT-006 — Renewals:** assigned tasks, reminders, repricing, customer
  approval and retained history; no renewal without the configured authority/terms.
- [ ] **CONTRACT-007 — Acceptance/documents:** templates/PDFs, signature or documented
  acceptance process, access control and retention.
- [ ] **CONTRACT-008 — Profitability:** actual labor/material cost and agreement
  revenue with transparent allocation rules.

**Acceptance:** activate an agreement across assets, generate due work exactly once
under retries, complete evidence/checklists, report to the customer and renew via a
separate accepted version. Warranty dates alone must not imply legal coverage.

## M6 — QuickBooks accounting

QuickBooks is the accounting system of record; this app owns service operations.
Define object ownership and synchronization direction before enabling writes.
The user has no QuickBooks account yet. Sandbox verification and real-company
production authorization are separate steps.

- [ ] **QB-001 — Accounting workspace:** connection/environment, mapping health,
  queue, last sync, reconciliation exceptions and actionable failures.
- [ ] **QB-002 — Online OAuth:** provider app, callback validation, encrypted tokens,
  refresh, company/realm binding, sandbox/production separation and disconnect.
- [ ] **QB-003 — Mapping:** customers, items, tax codes, accounts, payment terms,
  currency and external IDs; review duplicates before exporting.
- [ ] **QB-004 — Invoice export:** validated lines/totals/tax/discounts, references,
  deduplication and external links. Include approved project-phase/application and
  retainage mappings from M11 when supported; keep operational applications distinct
  from posted accounting invoices. Define edits after export and uncertain-write
  handling; never blindly retry a write that may already have succeeded.
- [ ] **QB-005 — Payment/status import:** reconcile external balance/payment changes;
  invoice creation is not payment and does not establish cash receipt.
- [ ] **QB-006 — Reconciliation:** missing objects, mapping errors and differing
  totals with auditable operator resolution.
- [ ] **QB-007 — Reliable sync:** workers, rate limits/backoff, incremental reads,
  verified webhooks, duplicate delivery tests and credential rotation.
- [ ] **QB-008 — Accounting permissions:** separate from HR/technician access;
  reviewed exports and audit for sensitive changes.
- [ ] **QB-009 — Desktop:** optional, separately designed bridge/Web Connector.
  Document Windows/company-file requirements; Online OAuth is not Desktop support.

**Acceptance:** authorize a real sandbox, map data, export an approved invoice,
repeat without duplication, reconcile a payment and test reconnect/revocation,
realm isolation and partial failures. Production needs separate company verification.

## M7 — Controls, commissioning and handover

- [ ] **CTRL-001 — Hierarchy:** building → system → equipment → controller/components
  with stable identifiers and move/replacement history.
- [ ] **CTRL-002 — Controller inventory:** manufacturer/model, protocol, addressing,
  point/network references and software/firmware. Protect network information;
  passwords belong in secret storage rather than service notes.
- [ ] **CTRL-003 — Checkout:** versioned point-to-point/sequence tests, readings,
  evidence, technician identity, review and sign-off.
- [ ] **CTRL-004 — Drawings/backups:** versions, provenance, hashes, equipment links,
  access control, retention and reliable restore/export.
- [ ] **CTRL-005 — Deficiencies:** severity, evidence, ownership, corrective work,
  retest and authorized closure.
- [ ] **CTRL-006 — Handover:** approved drawings/backups, checkout reports, open
  deficiencies and service history in an export or properly scoped customer portal.
- [ ] **CTRL-007 — Maintenance linkage:** tasks use the right equipment/template
  version and retain the exact version completed on a visit.

**Acceptance:** complete a controller checkout, record a deficiency, attach a
versioned backup, schedule corrective work and produce a traceable handover.

## M11 — Commercial and construction projects

**Status: Planned.** Commercial and Construction are business tracks on a shared
project/job-costing foundation. They should not become separate implementations of
customers, crews, purchasing, invoices or accounting. A company may operate more
than one track; a business track is not a separate tenant.

Commercial emphasizes proposal-driven service/install work and phased billing.
Construction emphasizes project delivery, progress applications, committed costs
and completion forecasting. Configure templates and workflow differences on shared
domain modules, with explicit permissions and accounting ownership.

### Shared project foundation

- [ ] **PROJ-001 — Project structure:** customer, contract/proposal, sites, project
  manager, phases, cost codes, milestones, deliverables, planned/actual dates and
  linked jobs/appointments. Convert an accepted proposal without re-entering scope.
- [ ] **PROJ-002 — Project management:** baseline budget and schedule, dependencies,
  progress, committed/actual costs, forecast, issues and overdue actions. Show each
  phase's responsible owner and preserve approved baseline versions.
- [ ] **PROJ-003 — Field documentation:** job/phase-linked photos, forms, daily logs,
  signatures, attachments and completion evidence, with author/time/version history.
  Define required evidence for billing readiness; signatures capture stated approval
  intent and do not silently approve unrelated scope or financial terms.
- [ ] **PROJ-004 — Crew management:** crews/leads, effective-dated membership, dispatch
  assignments and field time by person/job/phase/cost code. Include approval,
  correction history and labor-cost allocation; payroll export is a separate step.
- [ ] **PROJ-005 — Change orders:** versioned scope, estimated labor/material/subcontract
  cost, pricing, schedule impact, approval authority and customer acceptance. Approved
  changes update the current contract value/budget and become billable exactly once;
  pending/rejected changes remain distinguishable and cannot inflate approved totals.
- [ ] **PROJ-006 — Purchasing and inventory:** requisitions, approvals, POs, stock/truck
  reservations, receipts, issues, returns and vendor invoices tied to job/phase/cost
  code. Distinguish committed purchase cost, received material cost and billed cost;
  avoid double-counting commitments when actual invoices arrive.
- [ ] **PROJ-007 — Subcontractors:** company/contact, scope/package, approved commitment,
  change orders, submitted invoices, approval and direct costs against budget.
  Track required onboarding documents/expiry as configured; account for subcontract
  retainage and link accounting records without implying a payment occurred.
- [ ] **PROJ-008 — WIP reporting:** contract value including approved changes,
  percentage complete, earned revenue, actual/committed cost, estimated cost to
  complete, forecast at completion, billings, over/under-billing and retainage.
  Define calculation method and source for every measure. Separate operational
  estimates from posted accounting revenue, state the reporting cutoff/freshness,
  and retain approved period snapshots and correction history.
- [ ] **PROJ-009 — Project access/audit:** project-manager, field, purchasing,
  subcontractor-review and accounting capabilities; approval thresholds and
  segregation of duties. Record who changed budget, scope, progress or billing.
- [ ] **PROJ-010 — Project workspace:** summary, schedule, phases, documents, crews,
  change orders, purchasing, subcontractors, financials and closeout in one place.
  Provide drill-down from budget/WIP figures to the original business records.

### Commercial feature track

- [ ] **COM-001 — Proposal billing:** convert approved proposal lines into billable
  phases/milestones and a schedule of values; bill fixed amounts or accepted progress
  as configured. Track current/prior applications, approved changes, retainage,
  stored materials where applicable, remaining value and billing approval.
- [ ] **COM-002 — Commercial billing documents:** plan AIA-style application and
  continuation workflows, required data and export formats. Verify the applicable
  form/template rights before distributing AIA-branded or licensed forms; use
  properly authorized templates and label exports accurately. Freeze issued
  applications and preserve revisions rather than silently rewriting prior periods.
- [ ] **COM-003 — Commercial project workflow:** proposal → accepted scope → project/
  phases → crew execution/evidence → phase approval → application/invoice → payment
  reconciliation → handover. Support site/customer-specific approval requirements.

### Construction feature track

- [ ] **CONST-001 — Progress billing:** schedule of values, billing periods, original
  contract, approved changes, prior/current completion, stored materials, retainage,
  previous applications and amount currently due. Check cumulative limits and
  prevent billing the same completed work twice.
- [ ] **CONST-002 — Applications and certification:** draft/review/submitted/returned/
  approved lifecycle, versioned evidence, customer/GC approval and period locking.
  Include the same authorized AIA-form/export capability as COM-002; track invoice,
  application approval and payment as separate events.
- [ ] **CONST-003 — Construction delivery:** project/phases, dependencies, baseline
  versus actual schedule, crew time, commitments, subcontractor costs, changes,
  forecasting, WIP and closeout evidence using PROJ-001 through PROJ-010.

### Coverage and dependency map

| Requested capability | Commercial | Construction | Shared implementation |
| --- | --- | --- | --- |
| Proposal / progress billing | COM-001–003 | CONST-001–002 | Contracts, schedule of values, applications, invoices and QB mappings |
| Project management | Commercial project workflow | Construction delivery workflow | PROJ-001–002, PROJ-010 |
| Field documentation | Billing-ready service/install evidence | Phase/daily-log and application evidence | PROJ-003; CTRL handover and private file storage |
| Crew management | Crew time by job/phase | Crew time by job/phase | PROJ-004; Dispatcher and labor approvals |
| Change orders | Price, approve and bill scope changes | Price, approve and bill scope changes | PROJ-005; versioned contract/budget/billing events |
| WIP reporting | Earned revenue, forecast and retainage | Earned revenue, forecast and retainage | PROJ-008; approved accounting definitions and cutoffs |
| Purchasing & inventory | Job/phase-linked POs and parts | Job/phase-linked POs and parts | PROJ-006; BIZ-004 with one stock/commitment ledger |
| Subcontractors | Invoices/direct cost versus budget | Invoices/direct cost versus budget | PROJ-007; supplier/commitment/accounting mappings |

Dependencies: M2 repositories/migrations/audit/jobs/file storage, M3 appointments,
M4 customers/proposals, M5 contracts and M6 accounting mappings. Implement the
project/phase/cost-code model before progress billing and WIP; implement cost and
billing ledgers before aggregate reports. Select the calculation/approval policies
before building dashboards. Later reports may depend on a subset of M6 rather than
waiting for every accounting feature.

**Acceptance:** create one Commercial and one Construction project from accepted
scope. Budget phases, assign a crew, approve time, receive job-linked materials and
record a subcontractor invoice. Approve a change order and prepare two sequential
billing applications with retainage. Verify prior/current/cumulative totals, reject
duplicate billing, and trace WIP/forecast values to approved source records. Export
an authorized billing document, reconcile its accounting mapping and preserve the
issued application after later project changes. Verify permissions, concurrent
approvals, retries, period corrections and populated-data migrations.

## M12 — Residential service business

**Status: Planned.** Residential uses the same customer/equipment, pricebook,
appointments, contracts, invoices and accounting modules. Its screens and templates
optimize household service calls and technician-assisted sales rather than creating
an independent backend. Keep this track compatible with a company that also does
Commercial or Construction work.

- [ ] **RES-001 — Memberships:** service plans, equipment coverage, recurring visits,
  benefits/discounts, renewal reminders and customer self-service acceptance.
  Automatic renewal/payment requires configured terms and recorded authorization;
  support expiry, cancellation, payment failure and renewal exceptions. Reuse M5
  agreement scheduling and idempotent work generation.
- [ ] **RES-002 — Pricing and estimates:** versioned pricebook, equipment/service
  context, labor/materials, tax/discount rules and three configurable good/better/
  best options on a technician's tablet. Record chosen options and acceptance;
  convert into work/invoice without losing the accepted price/scope snapshot.
- [ ] **RES-003 — Call booking:** manual call intake plus optional online, after-hours
  or AI-assisted booking. Capture customer/location, issue, equipment, urgency,
  appointment preferences and dispatch handoff; prevent duplicate bookings and use
  configured escalation rules. Do not promise unattended coverage or guaranteed
  headcount reduction. Telephony, consent and actual service availability require
  explicit provider/configuration decisions.
- [ ] **RES-004 — Technician mobile workspace:** responsive/tablet-friendly job
  packets with customer/equipment history, accepted pricing, forms, photos,
  signatures, navigation links and completion/billing actions. Preserve clear
  online/offline behavior; any future offline write queue needs conflict resolution
  and successful delivery acknowledgment before reporting a server save.
- [ ] **RES-005 — Adaptive dispatch:** reuse the Salesforce-style board and resource
  availability. Suggest schedule changes from delays, urgency, duration and travel
  information where supported. Show impact and obtain dispatcher approval by
  default; any automatic rescheduling needs an explicit bounded policy, audit,
  customer/technician notification rules and failure recovery.
- [ ] **RES-006 — Reporting:** invoices, aging, payment status, membership renewals,
  booked/completed work and estimate conversion with documented definitions,
  freshness, permissions and source-record drill-down. Integrate with BIZ reporting
  rather than maintaining a separate residential reporting ledger.
- [ ] **RES-007 — Invoicing, payments and financing:** present approved invoice lines
  and balances in the field; integrate an optional payment provider for collection,
  receipts, refunds and reconciliation using provider tokenization. Financing is
  an optional provider workflow with customer choice and provider-owned eligibility/
  credit decisions; do not build an internal lending/underwriting system. Handle
  declined, pending, duplicate, partially paid and uncertain transactions explicitly.
- [ ] **RES-008 — Accounting and payroll handoff:** reuse QuickBooks mappings and
  approved time/labor exports so customer, invoice, payment and time records are
  entered once operationally. Document direction/ownership and supported payroll
  products. Exporting time is not proof payroll was calculated, filed or paid.
  Track sync exceptions and provide reconciliation instead of silent overwrites.

Dependencies: M3 scheduling, M4 CRM/quotes, M5 agreements, M6 accounting and relevant
M8 labor/reporting. Mobile service workflows can ship incrementally before payment,
financing, payroll or autonomous booking integrations. Actual financial or payroll
provider actions need dedicated capability checks, audit and real sandbox tests.

**Acceptance:** book a household service visit, dispatch a technician, open its
history/forms on a tablet, present three priced options, accept one and generate
an accurate invoice. Complete a real provider sandbox payment without duplicate
charges under retries, reconcile it to accounting, and create/renew a membership
according to the customer's recorded terms. Demonstrate booking conflicts,
rescheduling approval, declined/pending payments, failed sync and offline recovery.
Treat automated booking, financing and payroll as separately verified subfeatures,
not prerequisites for claiming unrelated mobile or membership work complete.

## M8 — Empower the business owner

- [ ] **BIZ-001 — Dashboard:** dispatch, pipeline, overdue work, quote approvals,
  renewals, outstanding invoices and accounting/integration failures.
- [ ] **BIZ-002 — Financial visibility:** operational revenue, labor/material costs,
  margins and contract profitability with source, timing and exclusions labeled.
- [ ] **BIZ-003 — Labor:** time entries, approvals, corrections and job costing;
  payroll is a separate capability from basic time tracking.
- [ ] **BIZ-004 — Inventory/purchasing:** locations/truck stock, reservations,
  consumption, reorder suggestions, purchase orders and receiving. Reuse M11 project/
  phase/cost-code commitments and material movements rather than duplicate ledgers.
- [ ] **BIZ-005 — Reporting:** saved filters, exports, scheduled reports, permissions,
  dataset definitions and freshness indicators.
- [ ] **BIZ-006 — Automation:** explicit triggers/actions, dry-run preview, approvals,
  audit, retries and safe disablement.
- [ ] **BIZ-007 — Customer portal:** separate external identity and customer-scoped
  access to accepted quotes/contracts, approved reports and invoices.

**Acceptance:** the owner can trace dashboard metrics to records and resolve an
operational/accounting exception without developer database edits.

## M9 — Deployment and scale

- [ ] **DEPLOY-001 — Direct install:** maintain Debian/systemd setup, ownership,
  updates, configuration, logs, health checks, backups and restore instructions.
- [ ] **DEPLOY-002 — Containers:** reproducible multi-stage non-root image, supported
  runtime, graceful shutdown, external configuration and persistent business state.
- [ ] **DEPLOY-003 — Compose:** app/database/worker and optional object storage,
  private networking, health dependencies and tested upgrade/recovery procedure.
- [ ] **DEPLOY-004 — Single-instance Kubernetes:** resources/probes, config/secrets,
  Service/Ingress, persistent storage and migration/upgrade steps. With SQLite,
  explicitly restrict replicas and rollout/storage behavior to avoid simultaneous
  database writers. Packaging is not horizontal scaling.
- [ ] **DEPLOY-005 — Multi-replica Kubernetes:** shared PostgreSQL, stateless API/web
  pods, durable workers, external files, shared session/rate-limit/locking strategy,
  connection pooling, migration Job and deliberate rollout/disruption policies.
- [ ] **DEPLOY-006 — Operations:** workload-based scaling, graceful drain, worker
  scaling, resource limits, metrics, alerts and supported capacity envelope.
- [ ] **DEPLOY-007 — Recovery:** retention, restoration drills, point-in-time recovery
  where supported, disaster recovery runbook and measured recovery objectives.
- [ ] **DEPLOY-008 — Qualification:** realistic concurrent dispatch/CRM/accounting
  load, failed jobs, database/queue outages, connection-pool exhaustion, migration
  ordering and rollback/recovery exercises.

**Acceptance:** install cleanly, restore data, upgrade populated records and recover
from failure using published instructions. Claim multi-replica support only after
shared-state and concurrency testing. A backup job is not proof of restoration.

## M10 — Later options

- [ ] Additional CRM providers after object ownership/sync behavior is proven.
- [ ] Social publishing after explicit authorization, provider approval, reviewed
  target/content selection and uncertain-delivery handling.
- [ ] Refrigeration/refrigerant records with researched jurisdiction-specific
  requirements; distinguish recordkeeping from compliance claims.
- [ ] Customer email/SMS with consent, templates, delivery status and provider costs.
- [ ] Multi-company SaaS only after tenant isolation covers data, jobs, credentials,
  files, audit, APIs, backups and migrations.
- [ ] AI tools with scoped permissions, confirmation for business writes, execution
  audit and recovery; no unrestricted production shell.

## Enterprise definition of done

- [ ] Feature ID, supported workflow/roles, domain owner and business rules documented.
- [ ] UI covers loading, empty, success, validation, permission and failure states.
- [ ] Server enforces authorization/invariants independently of browser controls.
- [ ] API contract, examples, errors and compatibility behavior updated.
- [ ] Migrations preserve populated data; rollback/recovery implications are tested.
- [ ] Tests cover real business rules, negative paths and relevant concurrency.
- [ ] Changed interactions receive appropriate browser/pointer/mobile verification.
- [ ] Secrets, customer data and logs follow documented access/retention rules.
- [ ] Audit events, metrics and operator recovery actions exist where required.
- [ ] Release notes state evidence and limits; live proof is distinct from fixtures/CI.

## Documentation structure to establish

```text
Features.md                  Product scope, milestones, feature IDs and acceptance
README.md                    Introduction and supported quick starts
docs/README.md               Documentation index
docs/product/                Workflows, glossary, roles and business rules
docs/architecture/           Domain/data/deployment boundaries and diagrams
docs/architecture/decisions/ Numbered ADRs and consequences/migration plans
docs/development/            Setup, conventions, tests and contribution workflow
docs/api/                    Authentication, API usage, errors and compatibility
docs/operations/             Runbooks, monitoring, incidents, backup and recovery
docs/security/               Permission matrix, secrets, threats and disclosure
docs/releases/               Deployment/migration/verification evidence per release
deploy/                      Executable deployment and configuration artifacts
```

The proposed sections are tracked documentation work, not a claim that the entire
enterprise documentation set already exists. Current guides:
[deployment](deploy/README.md), [accounts](deploy/ACCOUNTS.md),
[workspace/AI/builder](deploy/WORKSPACE.md), and [integrations](deploy/INTEGRATIONS.md).

## Next checkpoint

Finish and verify M1. Then select the first M2 service/concurrency slice needed by
M3 Dispatcher: job versus appointment model, schedule timezone and transactional
conflict policy. Plan the first QuickBooks sandbox slice after agreeing mapping,
ownership and reliable execution rules. Attach release evidence per feature rather
than prematurely marking a whole milestone complete.
