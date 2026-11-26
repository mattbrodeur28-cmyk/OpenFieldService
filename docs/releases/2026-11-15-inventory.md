# Native inventory and company weighted-average cost

Implemented pilot: authenticated Inventory app, warehouse/truck stock locations,
audited technician custody, deliberate legacy opening adoption, receipts, transfers,
approved count variance, reorder levels, latest-only reversals and paginated history.
Step 2 job stock usage and partial/full returns update native job material rows in
the same transaction. Fully returned rows remain as evidence and leave billing
candidates. Existing catalog stock/unit edits are guarded after adoption.

Owner/Admin manages setup, receiving/counts/reversals. A mapped active technician
can access their truck and shared warehouse stock, withdraw only from their truck,
and use/return on assigned active post-PJSA work. Supervisor delegation is explicit;
completed-job returns require supervisor review and cannot bypass finalized billing.
HR gets no inventory elevation. Session/role checks run after asynchronous bodies.

Company-wide perpetual weighted average uses integer milliunits/millicents and
BigInt proportional half-up arithmetic. Receipts change the company pool, transfers
preserve it, usage freezes source cost, and returns restore original issue value.
Deterministic location allocations reconcile exactly, with immutable valuation
snapshots and optimistic versions for repriced locations. Current USD only; catalog
reference cost and explicit selling price remain separate.

Local real Chrome proof on disposable data: opened 10.125 units at $12.50, transferred
2.125 to a truck, used 1.25 on an equipment-linked active job, returned .25, verified
native job usage 1 and truck balance 1.125. After the company-average change, received
.875 units at $25 into the warehouse: warehouse 8.875, truck still 1.125, and both
show the new rounded company average $13.59. Original job cost retention is covered
by automated tests. No live LXC, supplier, vehicle, GPS or accounting mutation.

Additive `_inventory_migrations` v1 stock/movements/usage/audit/legacy guards, v2
company valuation evidence; never alter applied SQL. Back up both SQLite databases
and private configuration and use matched app/database restore for rollback.

Reservations, real vehicle identity/maintenance/tracking, PO receiving, serial/lot
stock, complete stocktakes, offline queue and RMS remain open. Fleet/Purchasing
requirements and owner decisions are now M15/M16; no placeholder claims connectivity.

Validation: inventory tests include separate-process withdrawal contention,
idempotent retries, custody/role isolation, rollback injection, original-cost returns,
company-wide repricing and retained history. Full suite: 91 passing tests. TypeScript,
production build and whitespace checks pass. JS 452.85kB (134.73 gzip), CSS 82.64kB
(14.81 gzip). Browser proof is localhost only; LXC deployment remains unverified.

## Catalog allocation UI follow-up — 2026-11-25

Source-only, qualification deferred at the owner's request. Movement Ledger is a
native disclosure at the bottom of the location stock view, closed by default;
opening it retains paginated history and reversal actions. Changing location
remounts the disclosure closed.

Catalog quantities are company totals, not availability at the selected location.
Unmanaged legacy catalog balances are labelled not assigned. Owner/Admin can
choose Assign stock to location from the catalog, select the physical location,
and review its opening allocation. Receiving an unmanaged item with positive
catalog stock selects opening mode and prefills the existing full quantity.
Reviewed cost and movement reason remain explicit. The existing server command
requires the full original quantity, adopts once transactionally, and rejects stale
versions or a second adoption. No new purchase or duplicate stock is invented;
subsequent splitting uses the existing atomic transfer command. Already-managed
materials show location and company totals separately, without an opening option.
Material totals reload when the catalog opens and after inventory writes.

No migration or stock mutation was performed for this UI change. Browser and
regression checks remain deferred; verify 100 kits unassigned → opening 100 kits
at the chosen location → transfer a subset, unchanged company total, refresh,
permissions, concurrent adoption and retained weighted-average valuation later.
