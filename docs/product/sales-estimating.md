# Sales estimating and accepted-material purchasing

Owner requirements, 2026-11-15. Implemented foundations: reviewed Settings billing
profiles and a server-side exact estimate preview with native inventory cost snapshots.
Current Sales also offers native opportunities/pipelines/activities and saved internal quote draft revisions; Purchasing has internal POs and receiving. The internal workbench UI is a pilot awaiting full browser qualification. Customer offering/acceptance and accepted-material procurement remain planned. See [internal draft API](../api/sales-quotes.md). See [pricing API](../api/sales-pricing.md).

## Estimate lines and pricing

Use stable quote/quote-version/line UUIDs. Material lines reference existing materials
and retain current company-average cost plus its source snapshot/version. Technician
and apprentice labor use distinct role, headcount, estimated hours, cost/burden and
selling rate. Apprentice is optional. Include permits, licensing, subcontractor
allowances/quotes, travel distance, fuel and after-hours work as explicit line types.

Store quantities and money as exact scaled integers and retain calculation/rounding
inputs. Cost, selling price, taxes and margin are different amounts. Do not silently
charge travel twice as mileage plus an inclusive fuel allowance, or apply after-hours
both as a rate multiplier and a duplicate surcharge. Define each rule, show its effect
and require reviewed overrides. Allow fixed amounts, per-unit amounts and role-hour
lines, scope/exclusions, allowances and alternates. Internal costs stay out of customer
versions unless explicitly included in the selected document template.

## Company Billing Settings

Add effective-dated billing/tax profiles under Settings by state/jurisdiction and
Residential/Commercial work segment. Profiles configure explicit line categories,
rates, tax inclusion, reviewed exemptions, applicable place/date, fee treatment,
source/reviewer notes and overrides. One Labor tax category covers technicians,
apprentices and after-hours labor. Service, permits, licensing, subcontractors, fuel and travel distance are
non-taxable under the requested company policy; Other fees are removed. No default set of current legal tax rates is
claimed. This is configuration design, not legal/tax guidance. Missing profile or
unreviewed taxability must remain visible and block offering until explicitly resolved.

Drafts can recalculate; an offered/accepted quote retains the chosen profile, exact
line results and revision. Later Settings changes cannot rewrite that accepted bid.
Validate total/tax/discount rounding, mixed taxable categories, zero-rated/exempt
reasons, fee bases, invalid quantities, stale profiles and unauthorized price changes.

## Acceptance and procurement

Actual customer acceptance must refer to an immutable offered version and retain
attributed evidence; moving an opportunity stage alone is not acceptance. Convert it
once into the native job with accepted scope. Let the user select accepted material
lines and either create supplier-grouped draft POs or associate existing draft lines.

An allocation ledger records quote version/line, job, material, demand quantity,
stock reservation, PO/line and procured amount. Support split suppliers/deliveries and
partial selections, while bounding total allocated quantity and preventing duplicate
ordering on retry or concurrent acceptance. A later revision/change order changes
demand deliberately and reconciles existing stock/PO commitments; it cannot erase
received material or accepted history. Issued POs require reviewed amendment, not
an invisible line append. Supplier sending/ordering is a separate explicit action.

Material cost flows PO receipt → company stock value → actual job consumption. A
quote's estimated material line and PO commitment are not additional actual expenses.
Packing slips/receipts attach through shared documents and can be linked to the job,
PO and receipt independently of quantity/cost allocation.

Dependencies: SALES-005–009, SALES-013–016, TECH-009 reservations, M16 Purchasing and
ARCH-006 reliable external writes. Native UUIDs and transaction ownership must remain
clear before quote-to-job-to-PO implementation. Provider/customer portal qualification
is separate from fixtures or internal acceptance recording.
