# Native Purchasing and partial receiving

Owner/Admin Purchasing now has distinct supplier records, versioned PO drafts with
native material/job references, stable PO numbers, reviewed approval, issue, partial/
full receiving, pre-acceptance cancellation and closure of outstanding commitments.
Issued supplier/destination/material/price/quantity/terms stay immutable. Source
changes after approval require returning to draft and reviewing again before issue.
No supplier email/order submission, payment or accounting posting occurs.

Receipts record delivered = accepted + rejected quantities, actual unit cost, packing
slip text, price variance and over-receipt approval reasons. Accepted quantities post
one native inventory receipt and company repricing in the same synchronous database
transaction as PO state, receipt evidence, audit and replay acknowledgement. Rejected
items never enter stock. Historical job usage cost stays unchanged. Stock adoption
requires the same deliberate legacy opening review as Inventory.

Original order total, open material commitments and accepted material cost are
separate values. Material cost uses accepted price; estimated PO tax/freight remain
terms and are not silently capitalized. Supplier returns, AP bills/credits, landed
cost, project phases, vendor SKU mapping and post-issue amendments remain open.
Stock receipt reversals cannot bypass PO receipt correction; the Inventory UI must
link those entries back to Purchasing rather than offering direct reversal.

All mutations have actor-bound request keys, strict payloads, optimistic versions and
immutable issued/receipt/audit/request evidence. Two independent Node receivers
competing for the same PO cannot both post. Failed receipt or final acknowledgement
inserts roll back stock, value reallocation, PO state and replay records. Purchasing
roles are Owner/Admin only; HR gets no elevation. Reads/streamed bodies require live
session authorization; >50KB is413 even without Content-Length.

Real local Chrome, disposable data: supplier creation, 10-unit PO at $10, 7.25% tax
and $5 freight → order total $112.25. Approved/issued revision1. First delivery5,
accepted4/rejected1 → 6 open/$60 open material commitment/$40 accepted cost. Second
delivery accepted6 at reviewed $20 → received,0 open,$160 actual material cost; original
PO unit price stayed $10. Ship-to inventory showed18.875 units and$14.80 company
average, with both PO-linked receipt movements. Historical job cost is automated
proof. No LXC, supplier or QuickBooks mutation.

Additive `_purchasing_migrations` v1, inventory v1/v2 unchanged. Inventory exposes
internal caller-owned synchronous posting/option helpers; only invoke them inside the
service DB transaction. Back up both SQLite files/private configuration and restore
matched application/database versions. No multi-replica deployment qualification.

Combined Purchasing/document validation:110 tests pass, TypeScript/production build/
whitespace checks pass. JS497.61kB (145.83gzip), CSS82.97kB (14.87gzip). PO movements
now show native Purchasing links instead of independent reversal actions in Inventory.
Lists:50orders/page,100receipts/page; draft100lines; choices currently bounded to
500suppliers/locations and1,000materials/jobs and fail explicitly above that scope.
Searchable/paginated choice controls remain required for larger company qualification.

New owner requirements are tracked in DOC-001–005 for tagged ticket/PO documents,
and SALES-013–016 for line estimating, jurisdiction/segment Settings profiles and
accepted quote material demand linked to draft POs. Those are not completion claims.
