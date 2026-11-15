# Native On-Demand billing preparation

Step3 now offers Owner/Admin billing preparation over the original approved report,
labor IDs and job material usage. Explicit selling prices keep material cost distinct
from charges; reviewed billable minutes remain bounded by worked minutes. Exact-cent
arithmetic, source/version conflicts and audit rollback protect saved drafts. Quoted,
PM and unclassified work stay blocked pending their source-document policies.

Local Chrome on a disposable equipment-linked work order: entered150USD/hour,
eight billable minutes,1.25 relay units at25USD/unit and7.25percent tax; saved and
reloaded subtotal51.25USD, tax3.72USD, total54.97USD. Recorded relay cost remained
12.50USD/unit. No invoice/payment/accounting mutation occurred. Browser proof covers
preparation only; final readiness and invoice handoff remain open. Shared integration
fixture now supports report/timesheet/billing behavior tests without duplicate setup.

Checked additive billing migration1; existing execution gates stay intact. Back up
both SQLite databases/private configuration before upgrade and restore matching
application/database versions for rollback. No live LXC/provider qualification.

Validation:80 tests pass; TypeScript, production build and whitespace checks pass.
Local JS435.30kB (129.67gzip), CSS82.36kB (14.75gzip). Tests cover exact cent
rounding, explicit selling prices, zero-charge explanations, nonbillable safeguards,
source/version conflicts, category/permission denial and transaction rollback.
