# Weekly technician timesheets and accounting references

Owner clarification, 2026-11-25. Source implemented, **testing deferred**. No new
browser, regression, migration-preservation, provider or production proof is claimed.

A timesheet is one technician's Monday–Sunday week, not an individual job report.
The existing native timesheet head is already unique on `(technician_id,week_start)`;
submission, supervisor approval/rejection, locking and audited reopening apply to
that entire week. The Timesheets landing page now lists all technicians authorized for the current
account; selecting a technician opens their Monday–Sunday timecard. Owner/Admin sees
the company roster, including retained inactive technicians; a mapped technician
sees only their own authorized timecard. Search narrows the roster and a full-card
button supports pointer/keyboard selection. All technicians returns to the roster.
The selected timecard has one row per native Job/Work Order with seven date columns
and weekly totals. Expand source records for timestamps, breaks,
notes and individual job visits. Job number is the display identifier; stable job
UUIDs remain the accounting relationship even if a display number is renamed.

All displayed time is projected from existing report-backed actual time entries.
This increment does not introduce a second editable time ledger or infer hours from
Dispatcher estimates. Arbitrary weekly manual entry, non-job overhead/leave, payroll
rate classes and payroll/provider posting remain separate work. Job reports retain
safety/equipment and supervisor review requirements before weekly submission.
Worked, requested billable and break minutes remain separate. Week approval is not
an instruction to invoice all worked hours or recognition of payroll/payment.

Single-day entries contribute to that local company-date column. An overnight entry
retains its original duration but marks affected day cells unresolved because the
location of break time is unknown. Weekly totals still include its retained duration;
entries crossing the week boundary require correction/splitting before submission.
No evenly divided hours or invented break allocations are posted. Company timezone
is used without introducing a visible default timezone selector.

## Separate business references

- Job / Work Order number: native Job identifier. Timesheet entries, invoices and
  supplier PO lines each retain their existing native Job UUID relation.
- Customer PO: the customer's authorization/reference, stored in a versioned,
  audited Job extension. It is not one of our Purchasing order numbers.
- Supplier material POs: live native Purchasing orders whose material lines name
  that Job. One Job can use multiple POs and one PO can contain multiple Jobs.
- Customer payment method/reference: native invoice receipt ledger. Check number,
  transaction number, or optional cash receipt number is separate from both POs.
  A customer receipt is not a supplier payment or technician payroll payment.

Job and Invoice detail show these references in separate sections. Invoice views
label Customer PO as the *current Job reference*: issued-document PO freezing and
customer-facing invoice rendering remain separate work. Supplier PO commitments
are not automatically recognized as expense/payables; actual receipt/consumption
ledgers remain authoritative. No PO, invoice, receipt or Customer is copied into a
weekly timesheet to simulate a link.

## Deferred qualification

Verify multi-job weekly projection, cross-midnight and week/DST boundaries, multiple
visits to one Job, exact totals, weekly submit/lock/reopen, source token protection,
permissions and unchanged historical submissions. Verify Job→Invoice→customer PO
and supplier PO references, partial receipt balances, check/transaction/cash
recording, reversal retention and exact request recovery. User deferred all tests;
these changes remain local and unpublished pending qualification.

## Receivables follow-through

Finance → Receivables now has working source for native issued-invoice aging,
known outstanding amounts and a separate count of records needing reconciliation.
Invoice links open the same receipt ledger, Job links open the same Work Order,
and collections notes remain attributed internal history. Customer PO references
remain separate from supplier POs and payment references. This source increment is
untested; it does not complete credits, deposits or bank/QuickBooks reconciliation.

Roster-first navigation source update, 2026-11-25: technician dropdown removed;
no technician is selected implicitly on page load. Refresh reloads authorized options
without resetting the chosen week. Existing backend access remains authoritative;
the roster does not grant a Member access to another technician's time. The current
options pilot explicitly rejects more than500 technicians; scalable paginated roster
lookup remains open. Browser qualification remains deferred.

Automated follow-up: three new weekly projection tests pass with the complete234-
test suite, alongside existing timesheet submission/review/DST/CSV tests. See
[qualification record](../releases/2026-11-25-automated-progress.md) for the exact
coverage and remaining browser, payroll/provider and deployment gates.
