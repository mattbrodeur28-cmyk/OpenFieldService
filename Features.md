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

The navigation/profile/HR/channel refresh and conversational Builder core are
implemented in the [M0/M1 release](docs/releases/2026-11-14-workspace.md). M1 remains
in progress for full accessibility/theme qualification and later collaboration/preview
slices. Local browser evidence is not a live LXC deployment claim. Dispatcher core and the first Sales opportunities/pipelines/Kanban increment are
implemented. QuickBooks integration, contracts, broader CRM and Kubernetes
qualification remain planned work.

## Milestone order

| Milestone | Outcome | Status | Depends on |
| --- | --- | --- | --- |
| M0 | Product inventory, documentation and delivery standards | Implemented | Existing foundation |
| M1 | Navigation, profile/settings, HR, channels and conversational Builder | In progress | M0 |
| M2 | Maintainable backend boundaries and operational foundations | Planned | M0; complete M1 first |
| M3 | Salesforce-style Dispatcher app | Core implemented; accessibility qualification remains | M2 concurrency and scheduling foundation |
| M4 | Commercial CRM, Sales pipeline and quote-to-job conversion | In progress: Sales opportunities, pipelines, Kanban, follow-ups and CRM accounts/contacts | M2; existing customers/sites |
| M5 | Contracts, maintenance agreements and renewals | Planned | M4 customer/contact model; M3 scheduling |
| M6 | QuickBooks-backed accounting | Planned | M2 reliable integration jobs/audit; M4 mappings |
| M7 | Controls records, commissioning and handover | Planned | M4; existing equipment foundation |
| M11 | Commercial/construction projects, phased billing, crews and job costing | Planned | M2–M6 shared domains; project and ledger foundations |
| M12 | Residential memberships, mobile sales/service, booking and payment workflows | Planned | M3–M6 shared domains; relevant M8 capabilities |
| M13 | Technician workflow, actual time, timesheets and truck inventory | In progress; PJSA/report/actual-time and timesheet pilots implemented | M2, M3; shared users/jobs/materials |
| M14 | Refrigerant Monitoring System and dashboard | Planned | M13 inventory/time/job evidence; equipment baseline |
| M15 | Fleet, vehicle maintenance and live dispatch tracking | In progress: native vehicles, stock links and in-app maintenance | M13 shared stock/custody; M3 Dispatcher; authorized location feeds |
| M16 | Suppliers, purchase orders and receiving | In progress: suppliers, PO approval/issue and atomic partial receiving | M13 movement/cost ledger; M11 job/phase commitments |
| M8 | Business-owner reporting and operational controls | Planned | M3–M7 business events |
| M9 | Containers, Kubernetes and scale qualification | Planned | M2 shared-state/database work |
| M10 | Optional extensions and broader SaaS | Planned | Proven core workflows |

Milestone IDs remain stable; the table describes dependencies rather than a strict
numeric execution order. M11–M14 are business tracks and reuse shared
modules instead of duplicating the M3–M8 work.

Ordering can change explicitly. A narrow QuickBooks sandbox slice can precede
contracts once its mapping and reliable execution foundations exist. Architectural
boundaries must be designed before the Kubernetes milestone.

## M0 — Documentation and delivery standards

- [x] **DOC-001 — Roadmap:** maintain this file with feature IDs, dependencies,
  acceptance criteria, status and links to completed release evidence.
- [x] **DOC-002 — Documentation index:** link product, architecture, development,
  API, deployment, operations, security and release documentation from README.
- [x] **DOC-003 — ADRs:** record context, options, decision, consequences, migration
  and revisit triggers for significant architectural decisions.
- [x] **DOC-004 — Domain glossary:** define company/customer, contact, site/building,
  equipment/controller, job/work order, appointment, contract, invoice and payment.
- [x] **DOC-005 — Delivery template:** problem, users/roles, workflow, business rules,
  data model, API, errors, migration, tests, operations and acceptance evidence.
- [x] **DOC-006 — Release record:** commit, schema version, deployed version,
  validation performed, provider checks, migration instructions and known limits.

**Acceptance:** a new maintainer can locate setup instructions, the owning module,
API, permission rules, migration history and recovery runbook without this chat.
Documentation is reviewed with code; planned documentation is labeled accordingly.

M0 evidence: [module map](docs/architecture/overview.md), [glossary](docs/product/glossary.md),
[delivery standard](docs/development/delivery.md), [API map](docs/api/README.md),
[permissions](docs/security/permissions.md), [recovery](docs/operations/runbook.md)
and [release record](docs/releases/2026-11-14-workspace.md).

## M1 — Modern workspace

### Navigation and account access

- [x] **UX-001 — Apps:** keep Field Service service pages together; place App Builder
  and Knowledge in Apps and add Dispatcher when implemented. Remove duplicate
  Calendar navigation while preserving schedule bookmarks.
- [x] **UX-002 — Profile:** clicking the bottom-left username opens a profile popup
  with name, email, role, editable display name and password management.
- [x] **UX-003 — Settings:** move Settings into the account popup; Integrations is
  its own section, and Environment variables is restricted to Owner/Admin.
- [x] **UX-004 — Administration:** show people administration to Owner/Admin/HR.
  HR manages ordinary users and team membership only. Owner/Admin grant HR access;
  existing administrator-promotion restrictions remain. HR cannot manage privileged
  accounts, system configuration, provider app secrets or App Builder.
- [x] **UX-005 — Device storage:** remove the persistent online storage banner;
  move enable/clear controls to Settings. Retain compact genuine offline/read-only
  feedback so users understand when changes cannot be saved.
- [ ] **UX-006 — Accessibility:** keyboard access, focus return, Escape dismissal,
  dialog focus trapping, contrast, reduced motion and usable mobile layouts.

### Shared UI system and modern interaction standards

The requested component sources and adoption rules are recorded in
[ADR-0001](docs/architecture/decisions/0001-ui-system.md) and the
[UI implementation guide](docs/development/ui-system.md).

- [x] **UI-001 — Design system decision:** shadcn/ui is the primary source-owned
  component system, Radix is the requested primitive foundation, and all adopted
  components use shared tokens and documented variants.
- [x] **UI-002 — NumberFlow:** local framework-independent adapter for selected
  operational counters, static first values, accessible text, reduced motion and
  bounded transitions; financial review/editing values stay static.
- [x] **UI-003 — Compatibility:** qualify selected Radix wrappers with the actual
  Preact toolchain, including types, refs, portals, focus and nested dialogs.
  Document the rendering-framework and styling decision: one Preact runtime,
  shared CSS tokens; Tailwind/reset adoption is deferred in ADR-0002.
- [x] **UI-004 — Shared primitives:** maintain reusable buttons, fields, menus,
  dialogs/sheets, tabs, tables, tooltips, notifications and loading/empty/error states.
- [x] **UI-005 — Workspace adoption:** migrate profile/settings, integrations,
  navigation, team channels and Builder to the shared system incrementally.
- [ ] **UI-006 — Business adoption:** Dispatcher, CRM, contracts, projects and
  accounting reuse the same primitives, accessibility rules and information hierarchy.
- [x] **UI-007 — Curated sources:** review Beautiful UI for AI/chat patterns, RareUI
  for selected interactions, Magic UI for restrained effects, and 21st.dev for
  individual components. Verify each source/license/dependency and adapt to shared
  tokens; avoid multiple competing themes or redundant libraries.
- [ ] **UI-008 — Interaction quality:** apply Emil Kowalski's design/motion guidance,
  require purposeful motion, immediate frequent keyboard actions, pointer-aware hover,
  reduced motion, responsive layouts and real-browser performance/accessibility checks.

**Acceptance:** trace each adopted component to its source and local wrapper;
prove one complete business workflow in light/dark, keyboard and mobile layouts.
Confirm a single rendering-runtime strategy, consistent styling and accurate
pending/success/failure feedback. Installing packages is not evidence of migration.

UI progress: shared Dialog/Tabs/Select/DropdownMenu/Tooltip and local form,
surface/status/table wrappers are implemented. Navigation, account/settings,
integrations, Team and Builder adopt the system. Tailwind is explicitly deferred;
Preact remains the only browser runtime. Dispatcher adopts the same components;
future business modules remain UI-006 work. UI-008/UX-006 and DISPATCH-009 retain
physical touch, screen-reader and broader responsive/theme qualification work.
See [the current release evidence](docs/releases/2026-11-14-dispatcher.md) and
[UI guide](docs/development/ui-system.md) for sources, decisions and exact scope.

- [x] **UI-009 — Timesheet layout polish:** make the Timesheets page feel cohesive
  with Dispatcher and shared business screens. Group Previous / selected week / Next
  into one aligned navigation control; match control heights and spacing. Separate
  the approval/status badge from the Daily View dropdown so state and filtering have
  clear, consistent placement. Revisit summary density and submission/review actions.
  Owner feedback (2026-11-15): the current page works but its buttons and status/filter
  arrangement do not flow together. Validate desktop, narrow screens and keyboard
  focus in the real browser before closing this item. Implemented: aligned week
  control group with previous/date/next and This week; week status in the header;
  entry filtering separate from approval, compact totals, and shared review panels.
  Verified real Chrome desktop and 400 px device emulation, keyboard daily filtering,
  and unchanged weekly totals/status under daily selection. Physical touch and
  screen-reader qualification remain UI-008. See
  [Timesheets UI release](docs/releases/2026-11-15-timesheets-ui.md).

### Team channels

- [x] **COLLAB-001 — Channel design:** modern header, avatars, grouped messages,
  date separators, timestamps, members panel and subtle motion.
- [x] **COLLAB-002 — Composer:** Enter sends; Shift+Enter adds a newline. Preserve
  failed drafts and distinguish pending delivery from a saved message.
- [x] **COLLAB-003 — Search/updates:** search recent messages, state the search limit,
  and label polling honestly. Later add pagination and streaming reconnect/resync.
- [x] **COLLAB-004 — Access:** membership protects messages. HR can manage a roster
  without automatically reading conversations in teams they have not joined.
- [ ] **COLLAB-005 — Later collaboration:** attachments, mentions, unread counters,
  notifications, replies, retention and moderation are separate follow-on slices.

### Conversational App Builder

- [x] **BUILD-001 — Conversations:** saved requests, assistant summaries and follow-up
  edits in the same draft thread; reopen prior drafts and start separate work.
- [x] **BUILD-002 — File selection:** automatic relevant frontend-file selection;
  searchable manual selection under Advanced. Explain the additional AI request.
- [x] **BUILD-003 — Cumulative drafts:** retain earlier changes and original hashes,
  allow more selected files within the supported limit, and preserve revision history.
- [x] **BUILD-004 — Review:** line-numbered additions/removals, unchanged context,
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
- [ ] **ARCH-014 — Native app integration:** one authoritative customer/site/equipment,
  work order, user and catalog identity across apps; reverse record links, shared
  capabilities and transactional handoffs. Snapshots preserve accepted documents;
  projections must identify their authoritative source. See
  [native-record contract](docs/architecture/decisions/0005-native-business-records.md).
- [ ] **ARCH-013 — Security:** centralized capabilities, session revocation, CSRF/CORS,
  rate limits, MFA/SSO roadmap, dependency/secret scanning and disclosure process.

**Acceptance:** business services can be tested without HTTP; migrations preserve
populated installs; retry/concurrency behavior is proven. Shared state is either
externalized or explicitly documented as single-instance.

### Tagged ticket and purchasing documents

- [x] **DOC-001 — Private uploads:** PDF and supported receipt/photo files on native
  job tickets with original filename, author/time, checksum, size/type validation and
  explicit limits. File storage is shared infrastructure, not a separate item copy
  inside each app. No public/static upload folder or automatic document execution.
- [x] **DOC-002 — Document tags:** Packing slip, Receipt, Invoice, Photo, Service
  report and custom tags; filter/search, versioned title/tag corrections and audit.
- [x] **DOC-003 — Native links/import:** one file can support job, PO and actual PO
  receipt through real native IDs. Admin can import/link an already-uploaded purchase
  document to a ticket without copying bytes. A document link is supporting evidence,
  not proof of material quantity allocation or a substitute for inventory movements.
- [x] **DOC-004 — Access/evidence:** admin full access, assigned mapped technician job
  scope, current access rechecked on download; no HR elevation. Preserve immutable
  bytes and approved report evidence; later ticket uploads are supplementary documents.
  Retain attributable metadata/link changes and reversible archive/restore behavior.
Document pilot evidence: [tagged documents release](docs/releases/2026-11-15-documents.md),
[API](docs/api/documents.md), [storage decision](docs/architecture/decisions/0006-private-documents.md).
Original bytes currently live privately in the service SQLite database with metadata
and links; online-backup restore is tested. This is a single-instance adapter, not
completion of ARCH-010 or multi-replica/object-storage qualification.

- [ ] **DOC-005 — Storage qualification:** private local and S3-compatible adapters,
  backup/restore, scanning/quarantine policy, retention/purge, object lifecycle and
  multi-replica qualification. External inbox/OCR imports need separate provider and
  extraction review; uploaded text must not become assistant instructions.

## M3 — Dispatcher app

Reference: the supplied Salesforce Field Service Gantt screenshot.
Core implementation and desktop pointer/keyboard verification are complete. The
remaining accessibility qualification is explicit below, alongside later features.
[API and operating rules](docs/api/dispatcher.md) define the job/appointment model,
timezone, availability, concurrency and metrics. M2's broader platform work remains.


- [x] **DISPATCH-001 — Daily Gantt:** one row per technician, hourly header, duration-
  sized appointments, date navigation, Today, zoom, horizontal scrolling and explicit
  schedule timezone/current-time marker.
- [x] **DISPATCH-002 — Work pipeline:** Open/Active filters, search, customer,
  location/equipment, priority, duration and assignment state. Map these labels to
  existing statuses before adding states. Distinguish jobs from appointments.
- [x] **DISPATCH-003 — Drag assignment:** drop an open job onto a technician/time,
  snap to configured intervals, save assignment/date/time, and revert a failed drop.
- [x] **DISPATCH-004 — Reschedule:** drag appointments across times/resources and
  adjust duration, with keyboard/form equivalents and completed/cancelled protections.
- [x] **DISPATCH-005 — Conflicts:** enforce overlaps and stale-version checks on the
  server, transactionally. Define availability/travel rules and authorized overrides
  with reasons/audit; browser-only collision checks are insufficient.
- [x] **DISPATCH-006 — Resources:** technician/team/territory/skill filters, active
  state and real availability. Do not fabricate breaks, utilization or travel times.
- [x] **DISPATCH-007 — Metrics:** actual scheduled hours, unassigned counts, overlap
  warnings and workload with documented calculations.
- [x] **DISPATCH-008 — Concurrent dispatch:** live change delivery/reconnect and tests
  for competing assignments by two dispatchers.
- [ ] **DISPATCH-009 — Accessibility:** real pointer drag, touch, keyboard assignment,
  reduced motion and a narrow-screen alternate view. Desktop pointer/keyboard and
  400px dark/reduced-motion assignment/save are verified; physical touch and
  broader assistive-technology qualification remain open.
- [x] **DISPATCH-011 — Company service hours:** admin-managed weekly hours and dated
  exceptions/holidays in the schedule timezone; 24-hour board, closed-time shading,
  retained existing work and after-hours warnings. Normal calls cannot bypass hours;
  On-Demand emergency/T&M needs deliberate admin override/reason after hours.
- [x] **DISPATCH-012 — Shared work categories:** existing job identity with native
  service classification: On-Demand (emergency/T&M), Quoted Work / Project and PM;
  old jobs remain Unclassified until deliberately categorized. Classification does
  not itself create an accepted quote, active agreement or accounting transaction.
- [ ] **DISPATCH-013 — Estimated versus actual:** scheduling uses an estimated slot;
  submitted/approved technician reports provide actual visit intervals and labor.
  Completed board slots use actual intervals with the original estimate retained.
  Keep elapsed time, per-person labor and billable hours separate (TECH-005/006).
- [ ] **DISPATCH-010 — Later:** maps, geocoding, routing, travel estimates, shifts,
  breaks, skills, multi-tech and multi-visit jobs; optional provider credentials.

**Acceptance:** drag a real job, verify saved technician/date/time after reload,
reschedule it, reject overlap/stale writes from two clients, and demonstrate error
recovery and keyboard assignment. Synthetic drag tests alone are insufficient.

## M4 — Commercial CRM

- [x] **CRM-001 — Accounts/contacts:** companies, service/billing contacts, contact
  roles, communication preferences, multiple buildings and billing relationships.
  Implemented: multiple contacts per account (optionally scoped to one site), six
  roles, per-contact email/phone/SMS usability preferences, archive/restore with
  retained history, cross-account billing links (a different account may be invoiced
  for a site, with PO-required flag) and account segment/type/parent classification.
  The legacy `sites.contact_*` primary-contact fields are left untouched, so no
  existing screen changed. Owners/Admin/Member write; Viewers read. Contact and classification updates are versioned; every write is audited in one transaction. See [CRM API](docs/api/crm.md).
  Not implemented: per-user record visibility (no owner model yet), contact
  import/merge (CRM-006), and any communications delivery (CRM-007).
- [ ] **CRM-002 — Customer 360:** contacts, sites/equipment, jobs, communications,
  proposals, agreements, invoices and activity in one customer workspace.
  Implemented: one read-only `/360` summary composing contacts (with billing/service
  shortcuts), sites, equipment, open-job counts, recent jobs, invoice totals and open
  Sales pipeline. Absent modules return `null` rather than failing, so "none" is
  distinguishable from "not installed". Nothing is copied — every figure is a live
  projection of the owning module's rows. Not implemented: communications history
  (CRM-007), proposals, full activity, and agreements (M5), which remain pending.
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

### Sales app — Kanban, quotes and conversion

The dedicated Sales app now implements opportunities, configured pipelines and
Kanban. Existing customer/site/equipment links are supported. Quote generation,
acceptance and Dispatcher/job conversion remain subsequent increments. See
[the release evidence](docs/releases/2026-11-14-sales-foundation.md) and
[API/permission/operating rules](docs/api/sales.md).

- [x] **SALES-001 — Opportunities:** title, prospect/customer, contacts, site/equipment,
  owner, source, expected value, expected close date, probability, next action and
  activity timeline. Support residential and commercial work without duplicate CRM.
- [x] **SALES-002 — Pipelines/stages:** administrator-configured pipelines and ordered
  stages (for example New, Qualified, Site visit, Estimating, Proposal sent,
  Negotiation, Won, Lost). Define required information and allowed transitions;
  stage names are configurable rather than new hardcoded job statuses.
- [x] **SALES-003 — Kanban:** drag opportunities across stages, owner/value/date/search
  filters, stage totals and list alternative. Persist moves, reject stale versions,
  explain failed transitions and offer keyboard/form equivalents.
- [x] **SALES-004 — Sales activities:** calls, meetings, site surveys, tasks, follow-up
  dates and in-app reminders; explicit permission-checked Team message links and
  preserved authors. External email/SMS/push delivery remains separate.
- [ ] **SALES-005 — Quote generation:** build quotes from opportunities using service,
  labor and material catalog items, quantities, tax, discounts, scope, exclusions,
  alternates, validity, customer/site details and reusable business templates.
  Owner detail (2026-11-15): line-by-line technician and optional apprentice labor,
  material, subcontractor, permit/licensing, fuel/distance and after-hours estimates;
  separate cost, selling price, tax, fees and margin with deliberate overrides.
  Implemented foundation: versioned internal draft quote persistence over the exact
  estimate calculator, frozen profile/material pricing and native line references.
  A draft workbench is implemented with line editing, server price review, saved
  revisions, bounded lookups, and pending-save protection. Browser qualification
  currently covers only the initial opportunity/profile/labor-entry flow; material
  selection, save/reload, history and narrow-layout checks are still pending.
  Customer-field saved-revision document review and escaped draft HTML download
  now omit internal costs/margin and label current native customer/location/equipment
  identity. They do not offer or accept a quote. PDF/print/browser qualification,
  issuer configuration, alternates and customer acceptance remain open.
  Reusable quote templates now have admin-reviewed immutable versions sourced from
  saved quotes, searchable history/archival, fresh material costs on application,
  and retained starting-template provenance on saved quote revisions. Applying one
  replaces scope/lines deliberately and requires fresh price calculation. Real browser
  template qualification remains pending. See [template API](docs/api/sales-quote-templates.md).
  See [internal draft API](docs/api/sales-quotes.md).
- [ ] **SALES-006 — Quote revisions:** immutable offered versions with revision numbers,
  internal draft vs customer-visible scope, price changes, approvals, PDF/export,
  delivered/accepted/declined/expired status and retained acceptance evidence.
  Implemented increment: an allowlisted draft document projection plus authenticated
  HTML review copy over any saved revision; current native identity is labeled.
  Offered identity snapshots, approval policy, PDF and delivery/acceptance remain open.
  See [document-review evidence](docs/releases/2026-11-15-quote-documents.md).
- [ ] **SALES-007 — Options and approvals:** present multiple priced options where
  useful; enforce discount/margin approval limits and record deliberate exceptions.
  AI may draft scope but must not invent pricing or claim customer acceptance.
- [ ] **SALES-008 — Quote to active job:** authorized conversion of an accepted quote
  creates one linked job (or an explicit phased-project handoff later), snapshots
  accepted scope/pricing, carries customer/site/equipment, and places unassigned work
  into Dispatcher. Keep opportunity, quote and job links visible in both directions.
- [ ] **SALES-009 — Conversion safeguards:** idempotency, transaction boundary, unique
  conversion references, stale-version checks and permission tests. Repeating a
  request must return the existing job rather than duplicate billable work. Mark
  Won/Converted only after the job is durably created; handle cancellation explicitly.
- [ ] **SALES-010 — Loss and nurture:** required won/lost reasons, competitors where
  known, reopen history, follow-up/nurture tasks and retained prior quote versions.
- [ ] **SALES-011 — Forecast/reporting:** stage amounts, weighted/unweighted forecast,
  quote acceptance rate, time in stage, activity and conversion metrics with clear
  date/currency/probability definitions. Do not count quotes as recognized revenue.
- [ ] **SALES-012 — Permissions and audit:** owner/team visibility rules, protected
  pricing/approval actions, auditable stage/quote/conversion changes and documented
  APIs, migrations, backup/recovery and end-to-end acceptance evidence.

- [ ] **SALES-013 — Estimating workbench:** material lines use existing catalog IDs
  and a retained company-average cost snapshot; labor lines name role (technician,
  apprentice or configured crew role), quantity/hours and reviewed cost/selling rates.
  Include subcontracts, permits, licenses, fuel/distance and after-hours lines. Support
  unit/fixed/rate-derived costs without double-counting travel or labor multipliers.
- [ ] **SALES-014 — Billing/tax profiles in Settings:** reviewed, effective-dated
  profiles by U.S. state/jurisdiction and Residential/Commercial segment, with explicit
  line tax categories, exemptions, source/review notes, rates and overrides. No baked-in
  current legal rates or automatic state-wide taxability assumptions. Offered quotes
  retain the profile/rule/rounding snapshot; missing configuration stays unresolved.
  Implemented foundation: admin Settings profiles with effective dates and immutable
  attributed review versions; exact server-side estimate preview with native material
  cost snapshots. Company policy: one Labor tax rule covers technician/apprentice/
  after-hours; service, permits, licensing, subcontractors, fuel and travel distance
  have no tax; Other fees removed. Internal draft snapshots and a pilot workbench
  are implemented; offer/acceptance snapshots and complete bid workflow remain open.
  See [Sales pricing contracts](docs/api/sales-pricing.md).
- [ ] **SALES-015 — Bid review:** compare estimated cost, selling value, markup and
  margin; distinguish overhead/burden, allowances, exclusions, alternates and taxes.
  Require explicit review for no-charge/zero-cost lines and configured approval limits.
- [ ] **SALES-016 — Accepted quote to procurement:** optional material selection from
  an actually accepted immutable quote version; create grouped draft POs or link lines
  to an existing editable draft PO. Preserve quote-line → demand/allocation → PO-line →
  receipt → job UUIDs. Track ordered/received/reserved quantities and prevent repeated
  acceptance/conversion or partial selection from ordering the same demand twice.
  Do not append silently to issued POs or automatically send a supplier order.

**Acceptance:** create a prospect/opportunity, move it on Kanban with pointer and
keyboard, generate/revise/accept a quote, convert it once into a linked active job,
assign that job in Dispatcher and read it back after reload. Concurrent conversion
must create one job. Reject unauthorized stage/pricing actions and stale writes.
Accepted quote changes require a new revision/change order, not silent overwrites.

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

## M13 — Technician execution, timesheets and truck inventory

Company Settings now persists the default IANA timezone per installation. Dispatcher,
report entry, Sales follow-ups and new sites use it; routine timezone labels are
hidden. Existing report UTC instants and equipment evidence stay unchanged. Future
white-label/multi-company settings require tenant-scoped storage and authorization,
not another global environment variable. See [execution release](docs/releases/2026-11-14-technician-execution.md).

Requested workflow: **1 Safety PJSA → 2 Post-work report → 3 Completion / Billing**.
This is a server-enforced workflow over the same work order, not three separate
apps or another copy of the job status. Detailed contract and implementation order:
[service operating model](docs/product/service-operating-model.md).

- [ ] **TECH-001 — Technician identity:** explicit active user-to-technician mapping,
  assigned-work permissions, crew membership and delegated supervisor actions.
  Never infer identity from matching names or expose payroll to HR by default.
  The explicit admin-managed account link and execution-author guard are implemented;
  legacy job-screen scoping and crew/delegation workflows remain open. See
  [service identity contract](docs/api/service.md).
- [ ] **TECH-002 — Workflow engine:** persisted/versioned job step, allowed
  transitions and per-category template; server checks across Dispatcher, job APIs,
  mobile and billing. Resume drafts, show blockers, preserve legacy jobs and require
  an audited supervisor reason for approved exceptions. Opt-in versioned enrollment,
  immutable approved PJSA templates/submissions, report revisions, actual-time ledger
  and supervisor completion review are implemented in standalone mode. Full billing
  readiness and category-specific templates remain open. Emergency is not a blanket
  PJSA bypass; establish a deliberate field procedure.
- [ ] **TECH-003 — Step 1 Safety/PJSA:** template version, task/site hazards, controls,
  PPE, relevant permits/LOTO acknowledgments, participants, timestamps and evidence;
  required answers before starting; changed conditions require reassessment. Approved
  company templates and jurisdiction-specific review precede production enforcement.
- [ ] **TECH-004 — Step 2 Post-work report:** findings, work performed, equipment
  readings, deficiencies, photos, customer acknowledgment and follow-up needs;
  actual visit times, labor entries, truck materials and RMS references. Required
  fields vary by On-Demand, Quoted Work and PM; preserve submitted revisions.
  Implemented: required linked customer equipment for Step 2 draft/submission, retained
  equipment/serial/site snapshot, textual findings and immutable revisions. Photos,
  acknowledgment and inventory/RMS references remain open.
- [ ] **TECH-005 — Time entries:** technician/job/visit/phase IDs, UTC instants plus
  timezone, start/finish/breaks, travel/work/nonbillable types, open timers, overlap
  prevention, manual-entry reasons and correction history. Multi-tech elapsed visit
  time differs from summed labor. No payroll calculation from schedule estimates.
- [ ] **TECH-006 — Actual Dispatcher slots:** preserve estimated schedule/revisions;
  final report establishes actual interval for completed work. Show estimate vs
  actual/variance and historical conflicts without rewriting subsequent jobs. Support
  cross-midnight/DST actual records; scheduling restrictions must not erase facts.
  Implemented: approved actual intervals replace estimated board cards, read-only
  evidence retains original estimates, midnight segments and explicit DST distortion
  warnings. Browser verified on a disposable ten-minute visit; broader field and
  multi-technician qualification remains open.
- [ ] **TECH-007 — Timesheets:** daily/weekly views built from the same entries,
  submission, approval/rejection, locked periods and audited adjustments. Separate
  payroll hours, billable hours and paid/unpaid breaks; scoped accounting export.
  Implemented pilot: weekly/daily start-date views, retained source snapshots,
  submission and supervisor review, locked periods, audited administrator reopening
  and scoped CSV of approved source entries. No wage/overtime/pay-treatment engine
  or payroll-provider posting is claimed. Timesheet visual polish is UI-009.
- [ ] **TECH-008 — Step 3 Completion/Billing:** verify PJSA/report/time/material/RMS
  completeness and required reviews; lock approved evidence and derive reviewable
  billing lines. On-Demand uses approved T&M, quoted work respects accepted scope
  and changes, PM uses entitlement/coverage and approved overages. Invoice readiness
  is separate from service completion, invoice posting and actual payment.
  Implemented preparation: admin On-Demand draft review of approved source labor
  and material usage, explicit selling rates/reasons, exact-cent totals and stale
  source/version protection. Final readiness/RMS checks, invoice handoff and
  quote/PM coverage remain open.
- [ ] **TECH-009 — Truck inventory:** real trucks as stock locations, technician
  custody assignments, shared material catalog, warehouse/truck transfers, receipts,
  returns, job/phase usage, reservations, counts and reorder levels. Append movement
  records with exact quantities; no duplicated per-truck item masters.
  Implemented pilot: warehouse/truck locations, audited technician custody, opening
  review, receipts, transfers, native job usage/partial returns and reorder levels.
  Real vehicle records/maintenance/tracking are M15; reservations, phase coding and
  complete stocktake workflow remain open. See [inventory release](docs/releases/2026-11-15-inventory.md).
- [ ] **TECH-010 — Inventory safeguards:** atomically validate availability, append
  movement/job usage and audit; idempotent mobile submissions, no silent negative
  stock, approval for adjustments, reversals and retained unit-cost snapshots.
  Implemented pilot: transaction/version checks, immutable movement/value evidence,
  actor-bound idempotency, approved count variance, latest-only reversals and retained
  job costs. **Company-wide perpetual weighted average** is the chosen cost method;
  quantities remain by location and transfers do not change company value. Concurrent
  separate-process withdrawal and injected-failure rollback checks pass. Offline
  queue/physical stocktake qualification remain open.
- [ ] **TECH-011 — Mobile/offline execution:** narrow-screen stepper, drafts,
  attachments, accessibility and explicit sync/conflict state; queue writes only
  after server idempotency and private cache protections are implemented.

**Acceptance:** an assigned technician completes PJSA, records a visit with breaks,
uses truck stock and refrigerant, submits the post-work report and timesheet; a
supervisor approves corrections, Dispatcher shows actual versus estimate, and
billing receives approved lines exactly once. Unauthorized cross-technician edits,
stale approvals, repeated submissions and negative-stock races must fail safely.

## M15 — Fleet and live dispatch tracking

- [x] **FLEET-001 — Vehicle register and custody:** VIN/plate, fleet number, make,
  model/year, status and service dates. Link each vehicle to one existing truck stock
  location; its technician custody is authoritative. Retain assignment history and
  prevent type changes that detach a linked vehicle from its truck inventory.
- [x] **FLEET-002 — Vehicle inventory:** open the same location stock, transfers,
  returns, reorder levels and job usage from the vehicle. No copied material masters
  or parallel vehicle stock counts. Changing technician custody must not move stock.
- [ ] **FLEET-003 — Maintenance reminders:** due-by date and/or odometer intervals,
  early warning thresholds, overdue state, service completion history, expenses and
  attachments. Record odometer source/unit/time and corrections; never invent mileage.
  Implemented pilot: due/overdue in-app reminders use company date and recorded
  mileage; Owner/Admin records immutable service cost/odometer/completion and advances
  recurring thresholds once. Non-recurring plans deactivate. Reminder delivery worker,
  email/push, attachments, odometer correction and production qualification remain open.
  See [Fleet release](docs/releases/2026-11-15-fleet.md).
- [ ] **FLEET-004 — Location adapters:** support all three owner-selected feeds:
  self-hosted Traccar, external GPS providers/trackers and technician phone updates.
  Authenticate ingestion, map provider/device identity to vehicle UUID, retain source,
  observed/received time, accuracy and stale state; reject bad coordinates/replays.
  Define source priority so an old phone update cannot overwrite a newer GPS fix.
- [ ] **FLEET-005 — Dispatcher live map:** authorized dispatch roles see vehicle,
  assigned technician and linked appointment with current/stale/offline indicators.
  Support map/list alternatives, polling or event updates and a documented self-hosted
  tile option. No fabricated positions, public tracking links or implied routing ETA.
- [ ] **FLEET-006 — Tracking governance and operations:** explicit work tracking
  start/stop, device revocation, location retention/deletion and access audit; restrict
  exact positions to authorized dispatch roles. Qualify real phone/background browser
  limitations, provider reconnection and maintenance worker recovery before production.

**Acceptance:** assign a vehicle to a technician, receive/transfer stock into its
existing location, consume it on a native job, complete an attributed maintenance
service, and show a real authorized feed on Dispatcher with accurate freshness.
A provider outage must show stale state rather than leave a misleading live marker.

## M16 — Purchasing, material costs and purchase orders

- [ ] **PURCH-001 — Supplier records:** shared supplier UUID, contacts, terms,
  currency, active status and material/vendor SKU mapping. Preserve existing material,
  job and future phase IDs; do not represent a supplier as a duplicate customer.
  Implemented supplier register/contact/terms and native material/job links, USD only.
  Material/vendor SKU mappings and multi-currency remain open.
- [ ] **PURCH-002 — Purchase order lifecycle:** draft, approval, issued, partially
  received, received, closed/cancelled; numbered immutable issued revisions, approval
  permissions, expected delivery, ship-to warehouse/vehicle, job/phase allocation and
  retained price/quantity/tax/freight terms. Keep commitments separate from actual costs.
  Implemented versioned draft/approve/issue, immutable issued revision, partial/full
  receiving, cancellation before acceptance and closure with retained shortfalls.
  Open material commitment and actual accepted material cost are separate. Post-issue
  amendments, project phases, approval limits and supplier delivery/export remain open.
- [ ] **PURCH-003 — Atomic receiving:** each partial receipt references PO/line,
  actual quantity and actual reviewed cost, then posts one inventory receipt in the
  same database transaction. Idempotency/version/remaining-quantity checks prevent
  double receipts. Record shortages, over-receipt approval and damaged/rejected goods.
  Implemented partial acceptance/rejection, reviewed price variances and explicit
  over-receipt approval. Shared inventory receipt, valuation, PO state and replay
  acknowledgement commit atomically. Independent receiver contention and injected
  failures pass. Packing slips have text references plus tagged file upload and
  PO/delivery-to-ticket import through DOC-001–004; broader file qualification is
  DOC-005. See [Purchasing release](docs/releases/2026-11-15-purchasing.md).
- [ ] **PURCH-004 — Company weighted-average costing:** extend the implemented M13
  cost ledger, using actual accepted receipt value plus existing company stock value
  divided by total company quantity. Transfers preserve value; returns retain original
  usage cost; losses use current average; gains use reviewed cost. Retain exact values,
  rounding evidence and historical job cost. Separate actual cost from selling prices.
  Actual accepted PO receipts now feed the existing company-average ledger; historical
  job cost remains unchanged after later purchases. Define landed-cost adjustments,
  vendor credits, bill variances and currency policy
  before provider posting; do not retroactively overwrite closed job snapshots.
- [ ] **PURCH-005 — Job costs and accounting:** trace PO → receipt → stock movement →
  job/phase usage; reconcile ordered/received/billed balances, supplier returns and
  credits. QuickBooks mappings/export need duplicate prevention and reconciliation;
  operational receipt does not imply vendor bill, payment or accounting posting.

**Acceptance:** approve a PO for existing materials, receive it in two deliveries at
reviewed prices into warehouse/vehicle stock, replay a receipt safely, and show the
new company average alongside unchanged historical job cost. PO commitments, received
stock and supplier invoices reconcile without counting cost twice.

Design and implementation sequence: [Fleet and Purchasing](docs/product/fleet-and-purchasing.md).

## M14 — Refrigerant Monitoring System (RMS)

Promoted from the later-options list at the owner's request. Shared customers,
equipment, jobs, technicians, trucks and inventory movements are prerequisites.
This milestone supports researched EPA recordkeeping, not an automatic compliance
claim. Verify current federal/state requirements and applicability before release.

- [ ] **RMS-001 — Regulatory requirements:** dated source matrix for Section 608,
  applicable AIM Act requirements and relevant state rules; equipment/refrigerant/
  charge/operation applicability, required fields, retention, deadlines and report
  formats. Version rules by effective date; obtain domain review before compliance
  assertions. Start with [EPA recordkeeping](https://www.epa.gov/section608/recordkeeping-and-reporting-requirements-stationary-refrigeration).
- [ ] **RMS-002 — Refrigerants and cylinders:** controlled refrigerant catalog, virgin/
  recovered/reclaimed status, cylinder IDs, tare/capacity/units, custody/location,
  supplier/reclaimer documents and technician certification references. Distinguish
  refrigerant contents from the reusable cylinder asset; prohibit unintended mixing.
- [ ] **RMS-003 — Equipment baseline:** refrigerant type, full charge, circuit and
  equipment classification, verified source/date and change history on the existing
  equipment record. Missing/unknown charge must not produce a fabricated leak rate.
- [ ] **RMS-004 — Field events:** purchases, transfers, additions, recovery, returns,
  reclamation and disposal linked to job/equipment/technician/cylinder/truck; exact
  mass and units, event time, reason and evidence. Distinguish recovered mass,
  inventory shrinkage, refrigerant additions and calculated emissions.
- [ ] **RMS-005 — Ledger and reconciliation:** atomic balanced transfers, quantity
  bounds, cylinder reconciliation, adjustments/reversals, idempotency and approved
  corrections. Reuse inventory movements; do not count a job usage and its cylinder
  withdrawal twice or treat recovered refrigerant as purchased stock.
- [ ] **RMS-006 — Leak service workflow:** applicable leak-rate method, source
  additions/charge/date window, inspections, repair/verification events, deadlines
  and missing-data states; retain calculation inputs and rule version. No universal
  hardcoded threshold or invented statutory deadline.
- [ ] **RMS-007 — Business dashboard:** stock by refrigerant/truck/cylinder, additions/
  recovery trends, unresolved balances, equipment histories, due follow-ups and
  reviewed compliance tasks. Drill through every KPI to underlying events; display
  units/date range/coverage and distinguish unknown from zero.
- [ ] **RMS-008 — Exports and permissions:** customer service records, inventory
  reconciliation and researched regulatory exports, retained versions/evidence,
  technician/supervisor/accounting roles and audit. Regulatory submission remains a
  separate authorized action; generating a report is not filing it.

**Acceptance:** trace a purchased cylinder through truck transfer, measured service
addition/recovery and reclaimer return, reconcile mass, reproduce equipment history
and dashboard totals, and export the applicable reviewed record set. Test unit
conversions, duplicate/offline events, cross-job references, corrections and missing
charge data. Jurisdiction-specific compliance qualification remains explicit.

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
- [ ] Additional refrigeration workflows beyond M14, with researched jurisdiction-specific
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

Inventory/company-average cost, Fleet register/in-app maintenance, Purchasing/partial
receiving and tagged ticket/PO documents now have migration/API, automated and local
browser evidence. Document online-backup restore is tested on disposable records.

Next implement Sales estimating, quote versions and acceptance (SALES-005–009,
SALES-013–016), including reviewed Billing Settings profiles and accepted-material
procurement allocations. Continue remaining M16 purchasing qualification, M15 reminder
delivery/tracking adapters, PM entitlements and reviewed invoice handoff. Complete
reservations/stocktake and UI-009 Timesheet polish before closing those tracks. Build
RMS on the same job/equipment/material evidence. Real GPS/provider/LXC qualification
remains separate from fixtures and local browser proof.

ARCH-003/005/006 and DOC-005 remain prerequisites for shared PostgreSQL, reliable
external writes, shared file storage and multi-replica Kubernetes; do not mark M2
complete from these single-instance modules. QuickBooks sandbox work follows reviewed
mapping and idempotent export design. Attach evidence to each delivered feature.

## Business app navigation — HR and Finance

Requested organization (2026-11-15): Fleet, Sales, HR, and Finance are peer apps.
HR contains **Staff, Onboarding, Documents**; payroll is not an HR tab.
Finance contains **Invoices, Receivables, Liabilities, Purchasing (POs)**.

- [x] **ORG-001 — App navigation:** HR and Finance routes and section navigation;
  existing invoices and purchasing use their original records and URLs. Staff
  reuses current account administration. Owner/Admin/HR can access people controls;
  HR membership alone does not grant Finance or privileged account management.
- [ ] **HR-001 — Staff records:** employee profile, employment status, supervisor,
  technician/account links, and employment history. Existing workspace accounts are
  available under Staff; they are not yet a complete employee system.
- [ ] **HR-002 — Onboarding:** versioned checklist templates, assigned tasks, start
  dates, acknowledgments, progress, reminders, and audited completion.
- [ ] **HR-003 — Personnel documents:** private employee-scoped storage, explicit
  HR authorization on upload/download, certifications/expiry, acknowledgments,
  retention rules, and audit. Do not reuse job-document access for personnel files.
- [ ] **FIN-001 — Receivables:** issued-invoice balances, payments/credits, aging,
  collections notes, and reconciliation. Derive balances from native records;
  avoid copying customer or invoice ledgers. Draft/cancelled invoices are not debt.
- [ ] **FIN-002 — Liabilities:** supplier bills, PO/receipt matching, credits, due
  dates, approval, and payment reconciliation. Separate committed PO spend from
  recognized payables; avoid double-counting QuickBooks balances.
- [ ] **FIN-003 — Finance permissions:** dedicated accounting capabilities and
  provider mappings. Current Finance app entry and Purchasing remain Owner/Admin;
  legacy invoice access is preserved. HR does not imply accounting permissions.

Onboarding, HR Documents, Receivables, and Liabilities currently show explicit
planned states. Navigation is not evidence these backends are implemented.

### Module navigation follow-up

Sales, Fleet, HR, and Finance have independently expandable sidebar groups, child
routes, and general overview pages listing every section. Sales pipeline uses
native opportunities/stages; Quotes has an internal draft workbench pilot. Customer offering and acceptance remain planned. Fleet vehicles/maintenance
and truck inventory use existing vehicles and stock locations; GPS remains planned.
Schedule is embedded directly above the Work pipeline on Dispatcher, whose board can create native jobs. Home
embeds the shared weekly schedule with every job-creation control suppressed.
Materials is the native catalog inside Inventory; legacy URLs remain available.
Customer equipment and job equipment selection use a searchable Location followed
by a location-scoped equipment dropdown. The backend validates the location belongs
to the requested customer; no customer, site, asset, or material copy is created.

Sidebar section disclosures persist per user in this browser, survive reloads, and
synchronize between tabs. Blocked/unavailable browser storage falls back to usable
in-memory navigation. These preferences never grant access or configure the server.
Module headings are one full-width disclosure button, including their chevron;
Overview remains the first child link. In the collapsed icon rail, Sales/Fleet/HR/Finance
children are hidden and module icons open the corresponding overview. Collapsing the
rail does not rewrite section preferences. Profile initials stay visible with mouse
as well as touch input. See [sidebar repair evidence](docs/releases/2026-11-15-sidebar.md).

Dispatcher's embedded week has no redundant Schedule heading. Selecting a day,
previous/next week, or Today updates the shared dispatch date and native board;
the duplicate daily toolbar controls are removed, leaving one shared weekly control group. Work pipeline remains an
all-date backlog so unfinished work does not disappear when navigating dates.
The requested extra In progress column was withdrawn; existing stage filters remain.

### Quote workbench pilot qualification

The Quotes UI now has deep links, explicit server calculation, exact decimal
inputs, native opportunity/material searches, profile-version review, saved draft
revision views, and guarded unsaved/uncertain navigation. Pending material refresh
blocks calculation/save/history changes; edited inputs invalidate prior previews.
The lazy module adds no second framework or business-record copy.

Real Chrome reached native opportunity/profile selection, entered disposable labor
pricing, and opened the second-line category menu. The Materials click was not
executed: automatic approval review could not complete because of an account usage
limit. Material selection, Calculate/Save/reload, revision interaction, navigation
prompts, and narrow-layout browser qualification remain pending. Unit/API results
are not substitutes for those checks. See
[quote workbench release](docs/releases/2026-11-15-quote-workbench.md).
