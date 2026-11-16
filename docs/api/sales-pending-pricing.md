# Pending material pricing contract

Existing `/api/sales/estimates/preview` and `/api/sales/quotes` POST commands support
an explicitly incomplete material line without creating a separate draft store.
Current opportunity ownership, profile versions/effective dates, exact integer
bounds, request journals, immutable quote history and CSRF checks still apply.

For a material line only, send `pricingPending: true` and `pendingPricingNote`
(trimmed 10–1000 characters). `unitCostCents` and/or `unitSellCents` may be null.
`materialId` may be null for an unlisted working item; an existing ID is validated
against native Inventory even in pending mode. Other line types remain fully
priced. Normal complete material lines still require a native material ID, both
numeric rates, and the existing reviewed cost-override reason when appropriate.
A pending flag may remain set with all numeric rates; it still prevents approval
until the estimator explicitly completes review. False is not a mode: omit both
pending fields when marking the line complete.

Calculations containing pending lines use `calculationVersion: 2`,
`pricingComplete: false`, `pendingLineIds`, and `knownTotals` (cost, gross, discount,
net, tax and total cents from lines with known values for that measure). The
ordinary aggregate is null if any contributing amount is unknown. Profit and
ratios are null when cost or net selling value is unknown. Known subtotals use the
same bounded, half-up, per-line exact integer tax calculation, and are not final
quote values. No null rate is substituted as zero in a priced line.

Complete calculations retain the previous version-1 shape and integer arithmetic.
Optional absent fields are not defaulted into old requests; prior exact command
hashes and journal replays remain valid. Quote lists add `pricingComplete` and
may return `totalCents: null`. Clients must distinguish unknown from zero.

Bid review returns `state: pricing_incomplete`, `qualified: false`, and the hard
`quote:pricing_incomplete` flag ahead of ordinary policy assessment. POST review
rejects approval with 409. Acknowledgment cannot override this gate. Document JSON,
HTML download and template publishing return 409 for an incomplete selected
revision. Complete historical revisions are still inspectable; incomplete history
never becomes exportable because a later revision was resolved. The native stock
snapshot is captured when a material ID is present; no fake ID/snapshot is produced
for an unlisted item.

Storage is the existing immutable quote/line JSON; no applied SQL migration changes.
Version-1 complete revisions remain readable. Backups made after pending revisions
exist require this application version or later: older calculators/UI do not
understand nullable prices. Do not roll back application code against such a
populated database without restoring the matching pre-upgrade backup.
