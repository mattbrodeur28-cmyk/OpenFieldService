# Main branch test-server checkpoint — 2026-11-27

The owner requested all current application work committed and published to `main`
for a test server. This combines the standalone branch history with the current
project/commercial/construction, Sales options/procurement, agreement workbench,
Customer communications, owner dashboard, Residential, inventory/purchasing and RMS
increments, plus the reorganized roadmap and recorded SLDS/HR-removal direction.

## Automated qualification

The isolated release snapshot was production-built before running its full suite.
The build and TypeScript check pass; the full suite passes 306/306 with zero
failures, skips, cancellations or TODOs. Local runtime: Node 26.7.0. The existing
large-main-chunk warning remains. Final test data uses a frozen event timestamp
for exact RMS command replay instead of recomputing the timestamp between calls.

These checks are fixture/API/source evidence, including standalone integration
tests, not browser or real-provider proof. Browser testing remains deferred.
Debian/Node 24, populated production-data upgrade/restore, real accounting/payment/
GPS/signature delivery and regulatory acceptance are separate qualification gates.
The new module surfaces are test-server increments, not a claim that all roadmap
acceptance criteria are complete. No actual deployment was performed in this step.

## Upgrade and recovery

Use `main` from `mattbrodeur28-cmyk/OpenFieldService`. Before first startup of the
new code, stop the service and retain the complete state directory containing both
service and workspace SQLite databases (including any WAL sidecars), private env
configuration and previous Git commit. Do not reset databases or overwrite local
checkout changes. Install the pinned dependencies, build, typecheck and run tests
before restarting. Read back health and login, then verify saved native Customer,
Job, equipment and invoice records on the test server.

The standard unit uses `/opt/openfieldservice`,
`/var/lib/openfieldservice` and `/etc/openfieldservice.env`; review overrides for a
custom install. A failed build should leave the service stopped until corrected.
Reverting code alone is not a database rollback after additive migrations; restore
the matching stopped-service state/config backup when recovery requires it.

Finder metadata is removed from source control. Local editor settings, package
stores and private preview password helpers are excluded from this publication.


## UUID migration test correction

The subsequent Residential/Commercial schema addition introduced
`customers.customer_type DEFAULT 'residential'`. The integer fixture predates that
column. The old preservation assertion iterated destination columns and compared
this legitimate default with an absent source property, failing on the LXC and
locally. The correction compares every original column and separately asserts the
new default, plus a regression case proving an existing commercial classification
survives conversion and repeat planning remains a no-op. No application migration,
schema or runtime code changes are needed for this correction.

Full local suite: 309/309 pass, zero failed/skipped/cancelled/TODO; production build
and TypeScript pass on Node 26.7.0. Existing chunk-size warning remains. Rerun on the
Debian Node 24 test server before restarting; the prior fail-fast updater leaves
the service stopped when tests fail. The logged `Workspace request failed: Error`
comes from the workspace negative-path test and is distinct from the failed UUID
assertion. LXC/browser/provider qualification is not inferred from local checks.


## Optional tax annotations test correction

The later quote-settings change intentionally made tax jurisdiction/review/rule
notes optional. The estimator's old negative-path test still expected a short
reviewNote to throw, which reproduced the reported LXC failure at line 217. This
correction leaves application behavior intact, replaces that stale assertion with
an invalid-type check, and adds a regression case for omitted/empty/short notes,
unchanged financial totals, maximum lengths and exempt-rate consistency. The
pricing API guide now documents the actual optional text contract. Category,
permission, version, immutable revision and exact arithmetic protections remain.

Full local suite: 319/319 pass, zero failures/skips/cancellations/TODOs. Production
build and TypeScript pass; the existing bundle-size warning remains. Actual LXC
readback remains an operator check. Reinstall the corrected updater from the pulled
checkout before retrying: failed updates cannot refresh their installed command.
