# Shared service operating model

Owner decisions, 2026-11-14. Status: work classification implemented in Dispatcher;
opt-in PJSA/report/actual-time pilot and company timezone settings implemented.
Billing handoff, full timesheets, inventory and RMS remain planned.
Feature IDs: ARCH-014, DISPATCH-011/012/013, TECH-001–011, RMS-001–008.

## Independent dimensions

| Dimension | Authoritative meaning |
| --- | --- |
| Market | Commercial or residential customer/work segment; not billing policy |
| Work category | On-Demand = emergency/T&M; Quoted Work / Project; PM |
| Scheduling | Planned date/start and estimated duration; actual visit is separate |
| Execution | Safety/PJSA → post-work report → completion/billing preparation |
| Billing | Approved T&M, accepted quote/change, or agreement entitlements/overages |
| Financial status | Draft/exported invoice, posted accounting record and payment are separate |

Never infer an accepted quote, PM coverage, customer approval or revenue from a
category label. Legacy jobs are Unclassified. The present `_service_work` record
references the existing job UUID; its category is authoritative. `_dispatch_job_state`
contains a trigger-maintained emergency projection for schedule protection. Changes
and assignment/audit commit in the same service-database transaction. The quote and
agreement milestones will add validated source-document references and lifecycle
rules rather than replacing the job or inventing new parallel job statuses.

## Planned execution contract

An explicitly mapped signed-in technician acts on an assigned job/visit. A safety
submission retains its template version, answers and acknowledgments. The server
checks required evidence on every transition, including older API entry points.
Equipment from the same customer is required before filling out Step2. A report
draft can be saved once equipment is linked; submission creates a retained revision
and equipment/serial/site snapshot. An accepted PJSA requires reassessment before
changing the equipment link. Company Settings provides the default timezone; routine
UI labels are hidden while UTC evidence and DST warnings remain explicit. Supervisor
corrections reference a prior revision and reason rather than overwriting evidence.
Do not immediately enforce new gates on historical jobs without migration policy.

Record actual UTC start/finish, local timezone and breaks. One visit interval can
contain several person-specific labor entries. A two-person one-hour visit occupies
one elapsed hour but contributes two labor hours before breaks. Scheduled minutes,
actual elapsed time, paid hours and billable labor are distinct measures. Prevent
person-time overlaps and duplicate submissions; do not infer a technician's user
account by display name. Actual cross-midnight/DST facts must be retainable even
when a planned Dispatcher slot must fit one unambiguous day.

For completed visits, Dispatcher should render approved actual time as the final
slot and offer the original estimate/variance. Keep schedule revisions; never move
other appointments retroactively to make actual work appear conflict-free. Actual
after-hours work is a fact to flag, not a reason to discard the report. A scheduling
exception does not waive the company's safety procedure.

Completion checks safety/report evidence, actual labor, stock usage and applicable
RMS events. Billing review derives line candidates from those source records once;
PM coverage/quote scope may make recorded labor nonbillable. Customer acceptance,
supervisor approval, invoice creation, export, posting and payment have independent
actors/statuses. QuickBooks owns the books, not the service execution timeline.

## Inventory and refrigerant ownership

One material catalog; stock locations represent warehouses and real trucks. A
movement ledger owns quantity changes, not an editable balance on each screen.
Job usage links its movement and cost snapshot. RMS adds refrigerant/cylinder and
equipment-event context to the same movements, with exact units and reconciliation.
Purchase, use, recovery and reclamation are different events. Dashboard values are
queries over the source ledger and must drill down to evidence. Keep jurisdiction
and rule-effective-date review explicit before labeling any export compliant.

## Implementation order and proof

1. TECH-001 identity mapping and capabilities; populated-data migration tests.
2. TECH-002/003 versioned safety workflow and legacy endpoint enforcement.
3. TECH-004/005 report revisions and person-time ledger; duplicate/concurrency tests.
4. TECH-006/007 actual Dispatcher projection and approval-based timesheets.
5. TECH-009/010 stock movements and job usage; races, reversal and retry tests.
6. RMS baseline/transactions/rule review and customer/business dashboard.
7. TECH-008 approved billing handoff with quote/agreement and QuickBooks work.
8. TECH-011 offline writes only after idempotency/conflict handling is proven.

Each delivery records automated, browser, device and deployment evidence separately.
