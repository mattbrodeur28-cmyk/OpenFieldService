# Agreement entitlement usage and exhaustion

M5 CONTRACT-005 increment, 2026-11-26. Optional included visits/hours and a response
priority bind to the retained operational authorization. Usage is a live projection of
approved native service evidence; it is not an allocation ledger, invoicing, revenue
recognition, a payment event or a claim of verified customer authority.

## Configuration

The authorization command (`POST /:id/activation/authorize`) may carry optional
`includedVisits` (nonnegative integer), `includedHours` (nonnegative integer minutes)
and `responsePriority` (`normal | priority | emergency`). They are stored immutably on
the activation row (additive v7 columns) and cannot be silently rewritten: changing them
is an explicit amendment workflow, not a later UPDATE. Omitting them leaves them `null`
(unknown/unconfigured), which never grants free coverage. Existing v5 authorizations
keep `null` entitlements.

## Consumption rules (proposed company policy)

Consumption is derived only from approved post-work evidence on the covered equipment
during the active authorized term. A visit is one approved report whose Job belongs to
the accepted customer and to an asset in the accepted frozen scope; hours are the sum of
approved `worked_minutes` on those reports for `work_type='work'` (travel and nonbillable
labor are excluded). Each report's Company date (in the frozen authorization timezone)
must fall on an active term date; out-of-term, out-of-scope, moved or retired equipment
evidence is never consumed. Approved evidence is the owning Service module's native
ledger; Agreements copies nothing.

`billingEntitlement` is true only when the term is active on the effective date,
entitlements are configured (both included visits and hours known) and neither included
visits nor included hours are exhausted. Exhaustion flips coverage to a billable
exception: the work remains explainable and in scope but is no longer covered.
`responsePriority` is surfaced metadata; dispatch ordering/response commitments are a
separate later workflow.

## API

Under `/api/agreements/:id`, session authenticated, private/no-store. Current business
readers can inspect; only Owner/Admin authorize.

- `GET /entitlement`: configured `includedVisits/includedHours/responsePriority`,
  consumed visits/hours, remaining visits/hours (never negative), `visitsExhausted`,
  `hoursExhausted`, `billingEntitlement`, current state/company date, and a per-report
  `detail` list naming each consumed Job/report/asset, its Company date and hours.
- `GET /coverage?assetId=&date=`: unchanged per-asset scope decision, now with real
  `includedVisits/includedHours/responsePriority` and `billingEntitlement` reflecting
  scope eligibility plus the entitlement state on the requested date.
- `GET /activation`: authorization summary now exposes the retained `includedVisits`,
  `includedHours` and `responsePriority` on the activation row.

## Storage, recovery and remaining gates

Additive `_agreement_draft_migrations` v7 adds three nullable columns to the immutable
activation table; no existing row or trigger changes. Back up both application databases
before upgrading. Remaining: entitlement amendments/renewal, per-visit/hour allocation
records with exact idempotency when work is cancelled or corrected, billable-exception
invoicing handoff, response-priority dispatch effects, holiday/timezone shifting,
populated v6→v7 upgrade/restore, browser workbench and real provider/LXC qualification.
Do not mark M5 complete from an exhaustion flag or a projected remaining-visit count.

## Profitability

M5 CONTRACT-008 increment, 2026-11-26. `GET /api/agreements/:id/profitability` projects
the authorized contract value (`priceCents` from the accepted offer), net native
material cost on in-scope jobs during the active term (sum of `usage` minus `return`
inventory-movement value), and a per-job allocation. `laborCostCents` is explicit
`null` until a reviewed labor cost-rate policy exists; margin is contract value minus
material cost with that unknown labeled. No revenue recognition or provider posting is
implied by this projection.

## Labor cost rate

CONTRACT-008, 2026-11-26. `GET/POST /api/agreements/labor-rate` maintains a reviewed
company labor cost rate (cents per hour, versioned, Owner/Admin). Profitability then
computes `laborCostCents = approved in-scope work minutes × rate ÷ 60`; an unconfigured
rate leaves labor cost and margin explicit `null` (never free labor). Per-role rates are
a separate future policy.
