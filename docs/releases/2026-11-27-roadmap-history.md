# Roadmap history preserved during the 2026-11-27 cleanup

These notes were moved from `Features.md` to keep the roadmap focused on scope,
dependencies and acceptance criteria. They are historical snapshots, not current
status or a new validation run. Later checkpoints supersede earlier statements
about deferred testing, missing implementations and next steps. Read the
[current roadmap](../../Features.md) and the
[automated evidence record](2026-11-25-automated-progress.md) together.

## Previous next-checkpoint note

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

## Earlier quote workbench browser checkpoint

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
[quote workbench release](../releases/2026-11-15-quote-workbench.md).

## Automated qualification follow-up — 2026-11-25

Automated checks resumed by user request. Production build and TypeScript pass;
196/196 tests pass, including six new agreement invariant/recovery tests and the
updated HR-based technician creation path in standalone qualification. This does
not complete the unqualified modules or authorize marking their acceptance gates
complete. Browser qualification remains deferred. See [exact coverage and remaining
gates](../releases/2026-11-25-automated-progress.md). No publication claimed.

Follow-up:209/209 tests now pass, adding eight HR/personnel and five platform custom-
field/registry checks. Qualification details remain in the same evidence record;
unchecked end-to-end requirements are not made complete by this count.

Finance/costing follow-up:220/220 tests pass, including seven native settlement/
legacy review cases and four worksheet math/tax/compatibility cases. Provider,
browser and remaining acceptance gates stay open in the evidence record.

Native Sales handoff follow-up:228/228 tests and TypeScript pass. Eight new tests
cover prospect/native-account/site/contact conversion and accepted quote/native
Job/Won/Dispatcher readback, retry/duplicate guards, rollback and retained cancellation.
Cross-process concurrency, populated upgrade, pointer/UI and external acceptance
gates remain open; accepted-scope billing is not supplied by the handoff.

Projection checkpoint:234/234 tests pass. Six new weekly timecard, Customer360 and
audit-stage timing tests strengthen native projection proof; isolated publication
qualification and all unfulfilled roadmap acceptance gates remain distinct.

Proposed contract PDF checkpoint:240/240 automated tests, TypeScript and production
build pass. Local preview startup after consistent backup loads review/PDF migrations.
Exact coverage and remaining acceptance/activation/browser/provider gates remain in
the qualification record.

Agreement lifecycle checkpoint:247/247 tests, TypeScript and production build pass.
The offer/delivery/response workbench and immutable exact-context backend now record
attributed acceptance separately from activation/signature verification. Preview
startup after consistent backup loads v4; remaining M5/browser/provider gates stay
open in the qualification record.

Agreement authorization checkpoint:254/254 tests, TypeScript and production build
pass. Seven activation cases plus a shared lifecycle fixture cover accepted-term
authorization, scheduled→active projection, frozen timezone, retained cancellation,
per-asset equipment-scope eligibility and exact retry/rollback boundaries. Preview
restarted after a consistent two-database backup; additive v5 loads on the live
snapshot. Remaining M5 maintenance/entitlement/work-generation and browser/provider
gates stay open in the qualification record.

Maintenance plans/work-generation checkpoint:260/260 tests, TypeScript and production
build pass. Six new maintenance cases cover versioned plans, seasonal filtering,
active-term gated due preview, idempotent native PM Job generation, auditable skips
and late-ack rollback. Preview restarted after a consistent two-database backup;
additive v6 loads on the live snapshot. Entitlement usage, holiday shifting,
populated upgrade and browser/provider gates stay open.

Entitlement usage checkpoint:264/264 tests, TypeScript and production build pass. Four
new entitlement cases cover immutable included visits/hours/priority binding, approved
in-scope visit/hour consumption within the active term, exhaustion flipping coverage to
a billable exception, and per-report consumption detail. Preview restarted after a
consistent two-database backup; additive v7 loads on the live snapshot. Amendments/
renewal, billable-exception invoicing, response-priority effects and browser/provider
gates stay open.

CRM activity checkpoint:270/270 tests, TypeScript and production build pass. Six new
customer-activity cases cover private vs customer-facing notes, assignee/due/reminder
validation, reminders and list filters, role boundaries, audited rollback, HTTP
guards and the v2→v3 upgrade. Attachments and reminder delivery remain open.

Sales outcomes checkpoint:274/274 tests, TypeScript and production build pass. Three
new loss/nurture cases cover required loss reasons, competitor retention, admin-only
reopen history, immutable outcomes and owner nurture tasks. The v3 outcomes ledger is
additive; won/lost/reopen history is now retained per opportunity.

Sales forecast checkpoint:274/274 tests, TypeScript and production build pass. A new
`GET /forecast` projection adds per-stage weighted/unweighted totals, open/won/lost
rollups, quote acceptance ratio and native conversion count with explicit definitions.
Historical cohort metrics remain open.
