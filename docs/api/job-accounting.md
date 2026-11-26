# Native Job references and invoice receipts (unqualified source increment)

2026-11-25: implemented in source, tests explicitly deferred. This is a local
single-database increment, not bank, QuickBooks, payroll or distributed qualification.

Base `/api/service`; active Owner/Admin only, no HR elevation. Reads/commands use
private/no-store responses. Current permission is checked after awaited JSON reads;
standard CSRF header and streamed 50KB body limit apply. Missing native Job/Invoice404,
stale source/version409, permission403. Commands execute in one synchronous service
transaction including audit/history, native status changes and request acknowledgment.

## Job references

`GET /jobs/:id/accounting?invoicePage=1&poPage=1` returns native Job ID/identifier,
`customerPo:{customerPo,version,updatedAt}`, linked invoices and supplier material POs.
Both lists are 25/page with hasMore. PO relation is from existing `_purch_lines.job_id`,
not a copied order or typed supplier PO number. Absent Purchasing returns null.

`POST /jobs/:id/accounting` strict `{requestKey,expectedVersion,customerPo,reason}`.
Request key UUID; initial version0; PO string0–200 chars, reason10–2000. Empty clears
the current reference with retained before/after audit. Changing it does not rewrite
an issued customer document. Invoice views explicitly label this as current Job data.

## Invoice payment read and receipt record

`GET /invoices/:id/accounting` returns native invoice/Job identifiers, current
customer PO, first25 supplier POs (navigate to Job for pagination), retained payments
and reversals, paidCents, balanceCents, companyDate and a sourceToken. Receipt history
is bounded1000, exceeding it returns422 for administrator export. Cents are exact
integer USD. Legacy REAL invoice totals must already represent exact cents; malformed
or over-limit totals need review, rather than silent rounding during collection.

A legacy invoice marked paid with no receipt history returns null paid/balance and
`legacyPaidNeedsReconciliation:true`; the system does not invent a payment method,
transaction number or zero-dollar balance. A separately reviewed legacy reconciliation
workflow remains open.

`POST /invoices/:id/payments` strict `{id,requestKey,sourceToken,amountCents,
currency:"USD",method,reference,paidOn,note,receivedAttested:true}`. IDs/key UUID;
amount1–10,000,000,000 cents, within outstanding balance; note10–2000; reference0–200;
valid calendar payment date not after company today. Method cash/check/bank_transfer/
card/other. Check and noncash methods require a reference; cash reference is optional.
Record only against sent/overdue invoices. Draft/cancelled invoices are not collectible
receivables. Active same-invoice method/reference duplicates are rejected; references
may legitimately span different invoices. Staff must explicitly attest money was
received. This does not process/clear a check, charge a card or call a bank.

Partial payment leaves the invoice unpaid. Exact payment of outstanding balance
updates the existing invoice to paid and retains its received date. The paid state is
a local receipt-ledger statement, not verified settlement. Deposits, credits, taxes,
overpayments, refunds and cross-invoice allocations are not supplied by this command.

## Reversals and persistence

`POST /payments/:id/reverse` strict `{id,requestKey,sourceToken,reason}` retains an
immutable attributed reversal and restores sent/overdue status if a paid invoice
reopens. It does not issue a refund or reverse a provider transaction. Payment and
reversal records cannot be edited/deleted; an invoice/Job context with payment
history cannot be silently reassigned or repriced. New-ledger paid status is checked
against active receipt totals by database guards. Generic legacy invoice paths still
require a broader accounting authorization/reconciliation review before FIN-001 closes.

One `_finance_accounting_migrations` v1 adds Job reference head/history, invoice
receipts, reversals, request journal and guards without rewriting old migrations or
native Jobs/Invoices/Purchasing records. Exact same actor/key/validated content returns
its original acknowledgment after current authorization; reused content differs409,
another actor403. Source tokens bind invoice context and current receipt/reversal
history. UI keeps the original uncertain command in memory; there is no durable
queue. Back up service and workspace files consistently before upgrading. Rollback
requires matching code/database backups; provider/distributed qualification remains open.

Before release: meaningful exact-money, legacy-paid, partial/overpayment, date,
replay, competing writes, reversal, immutable context, permission and populated
migration checks; frontend type/build/regression and pointer/keyboard receipt flows.
All remain deferred at the owner's request.

## Receivables and collections (additive finance v2)

`GET /receivables?page=1&search=&state=open&bucket=all&customerId=`. State open/all/
review; optional customer UUID (omit when unused); search0–200 literal chars. Bucket
all/current/1_30/31_60/61_90/over_90/undated/review. Returns25 native invoice rows,
total/page, companyDate, exact knownBalanceCents, unresolvedCount and aging summary.

Only sent/overdue/paid native invoice states participate. Open includes positive
known balance or unresolved balance; all includes settled issued invoices; review
includes unknown balances. Search spans invoice/customer/Job/customer PO. Summary
uses the search/customer/state scope across all pages; selected aging bucket narrows
rows only. USD is the current native invoice currency contract, not mixed-currency
conversion. Customer PO is current native Job metadata, not an issued snapshot.

Balances subtract active immutable receipts and credit notes, excluding retained
reversals in each ledger. Legacy
paid flags without receipt evidence, invalid/non-cent totals, over-receipts or a
paid state inconsistent with receipts return null balance and review status. Those
records are counted separately and excluded from known balances; unknown is never
zero. Draft/cancelled invoices are excluded from debt. A zero known total does not
mean all unresolved accounts are settled.

Days past due uses calendar dates in Company Settings, with zero/current for due
today or future, then1–30/31–60/61–90/>90. Missing/invalid due dates stay undated;
there is no inferred due date or aging based on a manually selected overdue flag.
This is a current projection, not historical as-of accounting. Local credit notes
are described below; no recognized revenue, customer deposit, bank-clearance or
QuickBooks-reconciliation claim is made.

`GET /invoices/:id/collections?page=1` returns current issued-invoice context token
and25 immutable notes/page/hasMore. `POST /invoices/:id/collections` accepts strict
`{id,requestKey,sourceToken,content,followUpOn}`: UUIDs; note10–4000 chars; date empty
or valid YYYY-MM-DD. Notes retain actor, original invoice context, follow-up date and
creation time. Same actor-bound journal/exact retry semantics apply. A stale invoice
context rejects409 before writing. Notes do not alter balance, send a customer
message, schedule an automated reminder, or mark a follow-up complete.

Additive `_finance_accounting_migrations` v2 adds only collections-note history/index
and immutable guards. Applied v1 SQL remains unchanged. Backend/type/build/browser/
populated-migration qualification remains deferred. Full FIN-001 additionally needs
qualification of local credits and legacy reconciliation plus provider/bank
matching, with explicit native ledger ownership and no duplicated external balances.

## Legacy paid-status resolution (additive finance v3)

Working source, untested. This resolves an unsupported legacy status flag; it does
not establish bank clearance or external provider reconciliation.

`POST /invoices/:id/reconcile-legacy` is Owner/Admin-only with the same CSRF/body,
transaction and actor-bound exact journal semantics. Common strict fields:
`{id,requestKey,sourceToken,resolution,evidenceReference,note,reviewAttested:true}`.
IDs/key UUID; evidence/note10–2000 chars. Eligible only when the native invoice is
paid but has no receipt ledger or earlier retained resolution. Original context,
including old status, amount, customer/Job and paid date, is retained immutably.

- `resolution:"record_receipt"` additionally requires `{paymentId,amountCents,
  currency:"USD",method,reference,paidOn}`. Receipt UUID, positive exact cents not
  exceeding original invoice total, valid nonfuture company received date. Method
  cash/check/bank_transfer/card/other; noncash reference required. Actual amount,
  method and received date are deliberately not autofilled from the old paid flag.
  The receipt goes into the existing native receipt ledger. Full amount retains
  paid; partial amount reopens the remaining balance as sent/overdue.
- `resolution:"reopen_unsubstantiated"` accepts no receipt fields. It reopens the
  full balance as sent/overdue after explicit review, preserving the old context,
  without inventing a zero-dollar payment, cash method or transaction reference.

A zero-dollar legacy invoice requires a separate reviewed zero-value close workflow;
this command cannot invent a receipt to reconcile it. Invalid exact-cent source
amounts still require explicit invoice review. A receipt-backed resolution may later
use the existing retained receipt-reversal command; it never deletes its original
review. A resolved flag cannot be reconciled twice or silently reset to paid without
sufficient active receipt evidence. Invoice/customer/Job/amount context remains
protected even when the resolution created no receipt. Invoice detail blocks delete
when either receipt or reconciliation history exists.

`GET /invoices/:id/accounting` now also returns nullable `legacyReconciliation`
with ID, resolution, receipt ID where applicable, evidence reference, note, actor
and recorded time. Source tokens bind this record in addition to invoice/receipts.
All clients must refresh source context before a new command; uncertain retries must
retain the original body. The UI has a dedicated review dialog and retained-review
section; neither response authorizes sending customer communication.

Additive finance v3 adds the immutable resolution table and context/status guards;
v1/v2 SQL is unchanged. Before qualification, cover full/partial/unsupported flag
resolution, stale/concurrent requests, exact retries, role changes, zero/invalid
amounts, date/reference checks, rollback after receipt write, retained reversals,
source history preservation and UI recovery. Tests remain deferred.

## Shared customer summary semantics (source, unqualified)

The standalone Finance service exposes a narrow `customerFinancialSummary` read
capability to native Job detail; CRM Customer360 consumes the same owning module
projection in its existing snapshot. Recorded receipts are separate from credit
settlements. Unknown legacy balances remain explicitly unresolved. Job detail
omits the old paid-invoice `customer_lifetime_revenue` alias when this Finance
capability is installed and returns `customer_recorded_receipts` with
`customer_financial_unresolved_count`. Compatibility backends without Finance retain
their old alias; they do not acquire native credit support from a frontend label.
Dashboard's existing completed-job price sum is labelled Completed job value,
not receipts or recognized revenue. None of these projections establishes bank
clearance, payroll, WIP or external accounting reconciliation.


## Reviewed unpaid-balance credit notes (additive finance v4)

Working source, unpublished and unqualified. Invoice detail now exposes credit issue,
retained history and reversal through Owner/Admin-only Finance commands. HR membership
and ordinary service access do not grant credit permission. This is a native ledger;
no customer notification, refund, bank transaction or QuickBooks posting occurs.

- `POST /invoices/:id/credits`: strict `{id,requestKey,sourceToken,netCents,taxCents,
  currency:"USD",issuedOn,evidenceReference,note,reviewAttested:true}`. Exact nonnegative
  cents, each at most 10,000,000,000, positive combined amount; valid nonfuture company
  date; evidence and reason each 10–2000 characters. Review is mandatory.
- `POST /credits/:id/reverse`: strict `{id,requestKey,sourceToken,reason}`. Reversal
  ID/key UUID, reason 10–2000 characters. Retains the original credit and reversal.
- Accounting reads additionally return `credits`, `creditedCents`, original
  `invoice.subtotalCents` and `invoice.taxCents`; ambiguous original components are
  null. Credit rows retain sequential CN identifiers, component amounts, actor,
  date, evidence, original invoice context and any reversal.

Issue only against known unpaid sent/overdue invoices after legacy-paid resolution.
Net plus tax must equal the original exact invoice total before crediting. Each
component cannot exceed its original amount minus active prior component credits;
combined new credit cannot exceed the outstanding balance after receipts/credits.
No current billing profile or tax rate is reapplied. Paid-invoice refunds, customer
credit balances, deposits and cross-invoice allocations require separate workflows.

Status follows the combined active receipt/credit settlement. Compatibility `paid`
means settled; a pure-credit settlement has no invented receipt or paid date. Reversal
reopens the balance using the due date in Company Settings. Ledger-backed invoice
context/delete/status protections include credits as well as receipts; original
invoice and credit records remain retained. UI delete protection recognizes credit
history even when every credit has been reversed.

Credit insert/reversal, status sync and actor-bound exact request acknowledgment
share the native transaction. Source tokens bind current invoice, receipt, credit
and legacy-review context. Stale source rejects; exact uncertain retries retain
original bodies. Dialogs freeze inputs and prevent closing while the outcome is
uncertain. The UI labels receipts, active credits and outstanding balances separately.

Finance migration v4 adds credit/reversal tables, immutable guards and credit-aware
invoice context/status protection. Applied v1–v4 migration SQL must remain unchanged.
Local preview startup applied v4; this is not populated-data preservation proof.
No credits or receipts were entered as part of this source increment. Deferred
qualification must cover net/tax component ceilings, prior partial receipts/credits,
pure-credit settlement, receipt/credit reversal ordering, stale sources, actor/key
recovery, unauthorized roles, retained original context, late-write rollback, native
Customer360/Receivables totals and keyboard/mobile dialogs. Build, tests and browser
QA remain deferred by user instruction; no release or external posting is claimed.

Automated follow-up: seven dedicated settlement/reconciliation tests and the full
220-test suite pass. See [qualification evidence](../releases/2026-11-25-automated-progress.md)
for exact assertions and remaining HTTP, populated migration, browser and provider
gates. Earlier untested notes above describe the original source checkpoint.
