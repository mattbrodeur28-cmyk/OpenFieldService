# Job costing spreadsheet

Status: implemented in working source, **untested**, 2026-11-25. Owner explicitly
requested testing later. No browser, type, build, regression or deployment check
has been run for this increment; it has not been published as a qualified release.

This is the estimating/quote workbench's cost worksheet. It is not actual job cost
recognition: actual labor, inventory consumption, supplier receipts and their
native ledgers remain authoritative for incurred cost.

## Worksheets and interactions

Material columns: Items, Quantity, Unit cost, Base price, Multiplier, Discount,
Misc, Tax, Total. Markup is deliberately removed at the owner's request. The
separate inventory cost and selling base prevent an implicit selling adjustment
from changing company stock value or hiding estimated margin.

Labor columns: Labor/role, Labor hours, People, Cost of labor per hour, Base bill
rate per hour, OT, DT, Tax, Total. Technician, apprentice and after-hours labor keep
their existing line kinds. Multiple rate bands use separate rows, not a second
unlinked workbook. Other job costs retain service, permits, licensing, distance,
fuel and subcontractor line kinds.

Enter edits cells directly. Tab moves cells; Enter/up/down move rows; Ctrl/Cmd with
left/right moves columns. Shift-click selects a rectangle for copying. Tabular
clipboard paste updates an existing range atomically; add sufficient rows first.
Pasting into a calculated column, outside the sheet, or pasting both OT and DT true
is rejected. Single-cell clipboard behavior retains native text editing. Clipboard
formulas are not executed; numeric fields must pass strict numeric conversion before
calculating/saving. Copying money uses decimal dollars, not raw stored cents. Formula-like text is
prefixed with an apostrophe when copying a range to avoid interpreting descriptions
as formulas in an external spreadsheet. Multiplier presets include 30/60/90/200%;
custom nonnegative percentages up to 1000% remain supported.

Undo/redo is local to the open workbook, with up to 100 edit groups; it is not a
durable audit/revision substitute. Changes made through row Details or a loaded
revision reset this local history. Saved revisions and accepted snapshots remain
immutable. No shared live-collaboration or offline-edit queue is claimed.

Row Details retains native material search, supplier-pending mode, inventory cost
evidence/override notes and travel grouping. An unlisted material does not create
an Inventory record. Missing supplier prices remain unknown rather than becoming
zero; offering stays blocked until all pricing/native links are complete.

## Calculation contract

Material multiplier is an increase over the base **selling** price. Final owner
clarification supersedes an earlier cost-times-percentage example:

- $100 base price, 30% multiplier → $130 effective unit selling price.
- $100 at 60%, 90%, 200% → $160, $190, $300 respectively.
- Unit quantity × effective unit selling price + flat Misc = gross row price.
- Apply the row Discount to that entire gross price, then the configured Materials
  tax treatment. Misc is charged once per row, not once per unit, and follows the
  same Materials tax/discount rule. It is not a new Other-fees category.
- Unit inventory/estimated cost stays separate. A 30% selling adjustment does not
  revalue stock or change a PO cost. Selecting a catalog item initially fills a
  blank base selling price from its available inventory cost for review; it never
  overwrites an already entered selling price.

OT is **1.5×**, not 1.5 percent; DT is **2×**. A $150/hour base bill rate becomes
$225 OT or $300 DT. The current estimating model applies that same premium to the
base estimated cost rate; those are independent base rates, so a $50 cost/$150
billing row becomes $75 cost/$225 billing in OT. This is estimate math, not payroll
law, a payroll engine, or actual technician timesheet classification. Premiums are
mutually exclusive; an after-hours kind receives a premium only when explicitly
selected, preventing a hidden second surcharge. Hours remain per person and multiply
by People. Labor tax uses the one existing shared Labor category.

Only Materials and Labor have configured tax rules. Service, permit, licensing,
fuel, distance and subcontractor rows remain outside tax scope under the owner's
company policy. No legal tax rates are seeded or inferred.

Inputs stay scaled integer cents, quantity thousandths and percentage basis points.
The server is authoritative. Effective unit rates round half-up to a cent, followed
by per-line quantity, discount and tax rounding. Example material input extension:
`materialPricing:{multiplierBasisPoints:3000,miscCents:1000}`. Labor extension:
`laborRate:"ot"` or `"dt"`; absence means regular. Extensions are strict and limited
to their compatible line kinds. Existing lines without extensions retain their
previous calculations. Calculation version 3 identifies worksheet adjustments;
versions 1/2 remain historical. Revisions/templates retain the base inputs, not a
compounded effective rate. Customer projection uses the effective selling rate,
shows flat Misc/premium context, and omits internal cost inputs.

Every edit clears the server preview. Tax/Total display Recalculate until the user
calculates or saves again; they cannot present a stale preview as current. Saved
pricing approval and frozen-offer guards continue to operate on exact server totals.

## Deferred work and qualification

Before publishing, add/execute meaningful numeric and persistence cases for material
multipliers, flat Misc/discount/inclusive tax, zero/pending inputs, extreme bounds,
OT/DT costs and rates, template/revision roundtrips and legacy calculation parity.
Review immutable existing offers separately; new rendering must not rewrite them.
Run type checking, frontend build and regressions only when testing resumes. Browser
qualification must cover actual pointer/keyboard cells, multi-cell paste rejection
without partial edits, undo/redo, locked historical/accepted quotes, narrow layouts,
row Details/material search, current/pending totals and customer document rendering.

This grid currently accepts values, not arbitrary Excel formulas, imports of XLSX
files, fill handles or multi-user collaboration. Those are additional capabilities,
not claims established by an editable table.

## Automated qualification follow-up

Testing resumed by owner instruction. Four focused worksheet arithmetic/tax/legacy/
pending-unknown tests now pass within the220/220 suite; TypeScript and production
build passed at the earlier checkpoint. See [exact coverage](../releases/2026-11-25-automated-progress.md).
Clipboard, pointer/keyboard, selection/undo, browser layout, live catalog/provider and
deployment qualification remain separate; this is not a completed UI acceptance.
