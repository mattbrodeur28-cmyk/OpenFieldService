# Purchasing API

Base `/api/service/purchasing`; session required; Owner/Admin only, no HR elevation.
Mutations require `X-Requested-With: OpenFieldService`; strict JSON <=50KB, current
permission checked after body reads. Integers use milliunits for quantity, cents for
unit money, basis points for tax; all prices currently USD. Reasons10..1,000 chars.

GET `/options`: suppliers, native materials/jobs and stock locations. Current pilot
bounds500 suppliers/locations and1,000 materials/jobs; larger scopes fail422 rather
than silently omit choices. Searchable choice pagination remains planned.

GET `/orders?page=1&status=all&search=`:50 rows/page plus hasMore; status enumerates
all/draft/approved/issued/partially_received/received/closed/cancelled. Literal search
on PO number/supplier name <=120chars. GET `/orders/:id?page=1`: native lines, accepted/
open quantities, immutable current issue snapshot, original totals, open material
commitments, accepted material cost and100 receipt rows/page plus hasMoreReceipts.
Closed/cancelled orders retain outstanding quantity as history but open material
commitment is0. Drafts carry no approved commitment. Freight/tax are original terms;
actual accepted material cost is separate and excludes landed-cost adjustments.

All commands have UUID requestKey. Identical actor/validated body returns retained
acknowledgement even after versions advance; changed payload409, different actor403.
UI retains the exact attempted key/body after uncertain responses. Never automatically
retry with a fresh key. Every command, audit and acknowledgement share one transaction.

POST `/suppliers`: `{requestKey,id,expectedVersion,code,name,contactName,email,phone,
address,terms,active,reason}`. Version0 creates. Code1..32 letters/digits/_/-, unique
case-insensitive; name1..160, contact<=120,email valid orblank<=254,phone<=80,address/
terms<=2,000. Existing supplier version must match. Current supplier changes do not
rewrite issued snapshots; active supplier required before draft/approval/issue.

POST `/orders`: `{requestKey,id,expectedVersion,supplierId,locationId,currency:"USD",
expectedDate,terms,notes,taxBasisPoints,freightCents,lines,reason}`. Client UUID id;
version0 creates numbered PO atomically. Drafts only. Expected date null or real
YYYY-MM-DD2000..2100; terms/notes<=2,000; tax0..10,000basispoints, freight0..1e8cents.
1..100distinct lines: `{id,materialId,jobId,description,quantityMilli,unitCostCents}`;
existing material and optional existing job UUIDs, description<=500,quantity1..1e9,
unit cost0..1e8cents. Total <=$100million. Draft save preserves number and replaces
reviewed lines. A job purpose link does not consume stock or automatically create cost.

POST `/actions`: `{requestKey,orderId,expectedVersion,action,reason}`. Actions:
approve(draft),issue(approved),return_to_draft(approved/unissued),cancel(unreceived
draft/approved/issued),close(issued/partial/received). Approval snapshots/fingerprints
current supplier, destination and material/job details; changes before issue require
fresh review. Issue creates immutable revision; post-issue amendments are not yet
supported. No supplier communication or order placement occurs from internal issue.
Close releases outstanding commitments while retaining all receipt evidence.

POST `/receipts`: `{requestKey,orderId,lineId,expectedVersion,expectedStockVersion,
deliveredMilli,acceptedMilli,rejectedMilli,unitCostCents,packingSlip,
priceVarianceReason,approveOverReceipt,overReceiptReason,reason}`. Issued open orders
only. Delivered1..1e9 equals accepted+rejected, each0..1e9; packingSlip<=120. Quantity
above remaining needs explicit approval and >=10char overReceiptReason. Accepted
price differing from issued unit price needs >=10char variance reason. Current
material unit must match issued unit, active ship-to and current stock version needed.
Cumulative actual accepted material value on a PO capped at$100million.

Accepted quantity posts one native inventory receipt/company valuation; rejected-only
delivery posts evidence without stock movement. Native receipt movement, PO receipt,
state, audit and replay acknowledgement commit together. Receipt reference links to
its immutable issue. PO receipt movements cannot be independently reversed through
Inventory; reviewed supplier-return/credit workflow remains open. Zero-value material
is allowed with required receipt reason; it is not a payment or accounting export.

Private file upload/tagging/import uses [Documents](documents.md), including actual
PO receipt UUID. Supplier returns, bills/credits, landed cost, phases, vendor SKUs,
post-issue amendments, approval limits, public ordering, quote demand allocation and
QuickBooks reconciliation remain roadmap work. No project/SaaS/Kubernetes readiness
is implied by this single-instance pilot. See [release evidence](../releases/2026-11-15-purchasing.md).
