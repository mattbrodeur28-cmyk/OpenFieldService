# CRM pipelines and stage aging

Source increment, 2026-11-25. Tests and browser qualification remain deferred by
owner instruction. Local source is not a tested release or deployment claim.

## Shared records

M4 CRM-003 uses the existing Sales opportunities and configured pipeline/stage IDs.
It does not introduce another CRM opportunity, account or stage table. Customer
360, pipeline cards and quotes continue to refer to the same native customers,
sites, equipment and opportunities. Existing configured transition requirements,
Lost/reopen reasons and ownership rules remain authoritative. Won remains reserved
for the accepted-quote native-job conversion, whose new source awaits qualification.

## Current-stage age

Board and list reads project the latest retained audit event that actually changes
an opportunity's stage ID, including creation, reopening and accepted conversion.
The event is selected by audit sequence, not a maximum timestamp. Its resulting
stage must agree with the current opportunity. Notes, contact edits, value changes,
probability edits and stage renaming do not restart the clock. No extra history
ledger is created and no source migration is needed.

The authenticated Sales list/detail response adds optional client-compatible
`stageTiming:{status,enteredAt,elapsedMinutes,observedAt,auditId}`. Known timing is
UTC and whole elapsed minutes as of the server read. Missing history, stage mismatch,
invalid timestamps or a future timestamp return explicit unavailable/review status
with null entry/elapsed fields. Nothing falls back to `updated_at` or invents a
stage-entry date. Closed-stage age is time in that closed stage, not sales-cycle
length, service delay or recognized revenue.

Kanban cards and the list show completed minutes/hours/24-hour periods in stage.
Polling refreshes the observation; the displayed age is not a live local countdown.
It applies to the current page only. Full filtered stage-duration distributions,
time spent across repeated visits, acceptance-rate cohorts and business-calendar
SLA thresholds remain future SALES-011 work.

## Remaining M4 work

CRM-003 now has unqualified source for a reviewed prospect-to-native-account/contact/site
conversion, duplicate detection, existing-account reuse and transactional recovery.
See [prospect conversion API](../api/sales-prospect-conversion.md). Full acceptance
and qualification remain open.
It must not make duplicate Customers while accepting a quote. Customer360 now has unqualified source for Sales-owned follow-up/proposal
summaries. CRM-004/007 still need scoped communications/document activity; M5 owns agreements. SALES-005 through009
contain substantial unqualified local estimating/conversion work. CRM-006 import,
merge/export and PII controls remain open. Do not mark M4 complete from the Kanban
screen or this read projection.

## Deferred qualification

Cover creation, repeated moves, Lost/reopen, conversion Won, unchanged-stage edits,
notes, same-second audit ordering, missing/mismatched history, future timestamps,
UTC/DST boundaries, pagination, current permissions and safe rendering. Verify the
real card/list layout after backend reload. Existing applied Sales migrations must
remain byte-for-byte unchanged. No testing was run for this increment.
