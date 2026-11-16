# Sales bid review and pricing approvals

Company policy must be explicitly configured by Owner/Admin; absence is unresolved,
not approval. Versioned policy sets a minimum gross margin, maximum per-line selling
discount, and whether every quote needs manual approval. No tax, legal, market-rate
or profitability recommendation is implied by these configurable values.

Review uses exact saved quote costs/net selling values, not current stock prices.
Margin-floor comparison uses integer cross-products to avoid rounding a small loss
to zero. Zero-cost and no-charge lines, discounts above the limit, insufficient or
undefined margin and configured mandatory review create stable, explicit flags.
Owners/Admins must acknowledge every current flag and record a review note to approve
an exact saved quote revision under an exact policy/evaluation version. Members can
inspect their own opportunities' reviews; Viewer/HR does not gain pricing authority.

Approval/revocation events and policy revisions are immutable. Current quote,
policy and event-sequence checks prevent stale or competing approval writes.
Exact actor-bound retries recover a committed event; failed retries cannot disprove
an earlier uncertain write. Explicit revocation blocks qualification for that
revision until reviewed again. Changing the quote creates a new revision with no
inherited approval; changing policy requires current-rule evaluation and never
rewrites earlier approval evidence. A policy may deliberately permit within-limit
quotes without a manual event; that is policy qualification, not an admin signature.

Review qualification is internal pricing control. It does not offer a quote,
freeze customer/issuer identity, record delivery/acceptance, create a job/PO/invoice,
or send any external communication. Those future commands must recheck current
qualification inside their own transaction. Overhead/burden modeling, allowances,
alternates, issuer templates and document/offering workflows remain separate work.

## Availability and qualification

Implemented in the internal quote workbench and under Profile → Settings → Bid
review and pricing approvals. Policy dialogs require explicit rates and review
notes; no market rate is prefilled. Current saved revisions show policy qualification,
flags, financials and manual-event history. Admin dialogs acknowledge every exception;
revocation requires an explicit rationale. Read-only/historical/unsaved work cannot
be approved through the UI. Server checks remain authoritative.

Backend tests and migration checks do not establish actual modal/checkbox/keyboard
or screen-reader behavior. Those browser gates remain pending. Actor IDs and event
notes are retained in the API audit; resolving historical actor names for richer UI
presentation remains a follow-up. No issuer, PDF, delivery or acceptance claim is
introduced by this pricing-control increment.
