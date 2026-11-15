# Billing profiles, exact estimate preview and Settings spacing

Owner/Admin Settings now manages state/jurisdiction and Residential/Commercial
billing profiles with effective dates, explicit category tax rules, review notes,
version conflicts, immutable attributed revisions and actor-bound replay journals.
Only Labor and Materials have tax controls. Technician, apprentice and after-hours
labor share Labor. Service, permits, licensing, subcontractors, fuel and travel
distance have zero tax under the requested company policy; Other fees are removed.
Earlier local split profiles require explicit review; old history stays unchanged.

Exact server-side preview supports reviewed cost/selling lines, labor headcount,
quantity, discounts, inclusive/exclusive/exempt tax, profit, margin and markup.
Native material snapshots use company weighted-average stock cost and a fingerprint;
missing/different cost requires a reviewed override. Duplicate included fuel charges
are rejected. No stock/job costs change. This is not the saved estimate workbench,
customer quote/acceptance, job conversion, invoice or accepted-material PO allocation.
Those SALES-005–009/013–016 requirements remain open in Features.md.

Settings has consistent 32px content and24px card padding (smaller on mobile),
spaced form fields, correctly sized checkboxes, responsive tax-rule cards and spaced
wrapping action/pagination buttons. Focus is neutral rather than the misleading red
ring. Billing UI loads on demand. No global customer/CRM styles were overwritten.

Real local Chrome: created disposable Commercial profile, entered7.25 material tax,
reopened it and selected inclusive treatment by native pointer; saved revision2.
After the final owner policy changes, observed only Labor/Materials fields and the
legacy review gate, inspected padding/button spacing/neutral focused input, then
saved reviewed revision3. No production tax configuration, LXC or provider mutation.
Narrow/physical-mobile, screen-reader and multi-replica qualification remain open.

Database: additive checked `_sales_billing_profile_migrations`v1. Applied SQL was
not edited; configuration payload shape4 is distinct from migration numbering.
Online service SQLite backup includes heads/revisions/requests. Existing local
preview was backed up before the initial additive migration. Matching app/database
restore remains required. Earlier review history cannot be overwritten/deleted.

Validation: isolated release119 tests, TypeScript, production build and whitespace
checks. Concurrent unfinished CRM files and shared CRM hunks are excluded from this
release; their working files remain intact. See [Sales pricing API](../api/sales-pricing.md).
