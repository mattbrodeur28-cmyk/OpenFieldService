# Fleet and Purchasing design

Owner decisions, 2026-11-15: support self-hosted Traccar, other GPS providers and
technician phones. Use company-wide perpetual weighted-average inventory costing.
Native vehicle register, assignment, inventory links and in-app maintenance are now
implemented as a pilot. Supplier/PO approval, issue and atomic partial receiving now
also have a pilot; live tracking, reminder delivery and the remaining Purchasing
qualification work stay planned.
The native inventory pilot provides the authoritative cost and quantity ledger.

## Shared records and transaction boundaries

Vehicles reference a unique existing truck stock location. Location technician
custody is the single assignment authority; Fleet must read/write that assignment
through the inventory boundary and preserve its audit. Warehouse/truck quantity is
not duplicated. A linked truck cannot become a warehouse, even with zero stock.
Technician/account mapping, jobs, equipment and material UUIDs retain their meaning.
Vehicle register changes and location/custody updates must commit atomically.

Suppliers have business identities distinct from customers. Purchase order lines
reference existing material UUIDs and optionally existing job/future phase UUIDs.
Issued terms are versioned; receipts reference the issued line/revision. Partial
receiving updates received quantities and appends an inventory receipt plus audit
in one service-database transaction. A synchronous caller-owned inventory posting
boundary is required; never nest BEGIN statements or emulate atomicity over HTTP.
A later invoice/bill integration owns its own mapping/outbox and reconciliation.

## Cost model

Quantity uses integer milliunits; total stock value uses integer millicents, with
BigInt calculations. The implemented pool is the sum of every location's quantity
and allocated value for a material. Receipt adds actual accepted purchase value;
issue removes proportional company value, half-up. Internal transfer leaves pool
quantity/value unchanged. Each location receives a deterministic share of the pool
value; repricing increments affected balance versions and retains immutable evidence.

Example: company stock of 10 units at $10 plus 10 at $30 has an average $20/unit,
even if the purchases went to different trucks. A job using 5 units retains $100
cost. A later purchase reprices stock still on hand, without rewriting that job.
Partial job returns reintroduce their original issue value. Quantity-zero stock
must carry zero value; full issues exhaust the exact pool remainder.

Catalog `unit_cost` remains an editable reference cost, not the authoritative average
or a selling price. The inventory UI displays the company average rounded to cents;
exact movement values remain authoritative. This is currently USD only. Landed-cost
allocations, supplier return prices, closed-period corrections, AP bill variances and
multi-currency conversion need explicit policy before enabling those transactions.
Old local ledger evidence stays immutable; additive migration 2 introduces company
valuation snapshots, and subsequent movements allocate the existing total pool value.

## Fleet implementation sequence

1. Vehicle master, unique truck link and audited assignment, status and service history.
2. Manual attributed odometer readings and calendar/mileage maintenance schedules.
3. Durable due-reminder worker, deduplicated deliveries and overdue/dashboard views.
4. Feed contract with provider/device/vehicle IDs, observed/received timestamps,
   coordinates/accuracy, authenticated ingestion, replay protection and source priority.
5. Traccar adapter, external provider adapter configuration and explicit phone tracking.
6. Dispatcher map/list, freshness markers, restricted position access and self-hosted
   tile configuration. Qualify actual devices and reconnect behavior separately.

A normal browser cannot guarantee background phone tracking. It must clearly show
permission/tracking state and support a dedicated client or provider integration
where reliable background tracking is required. Capture no fabricated odometer or
live coordinates. Define location retention, user-visible tracking controls and
revocation before collecting production locations.

## Purchasing implementation sequence

1. Supplier master and PO drafts/lines with exact quantities/prices and version guards.
2. Approval/issue/revisions, stable PO numbers, commitments and shipping destinations.
3. Partial receipt command using caller-owned inventory posting and replayable IDs.
4. Receiving UI, shortages/damage/overages, supplier returns and price corrections.
5. Native job/phase cost tracing, document audit and QuickBooks reconciliation.

Verification must include a failed ledger insert rolling back the entire PO receipt,
two processes competing for a remaining quantity, partial-receipt replay, changed
cost/custody conflicts and retained historical job costs. No fixture/provider stub
counts as a live vehicle feed, delivered reminder or QuickBooks posting.
