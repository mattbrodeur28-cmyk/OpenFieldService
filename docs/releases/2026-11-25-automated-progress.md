# Automated qualification progress — 2026-11-25

Local working tree on feature/debian-standalone. Unpublished. The user resumed
automated tests/builds on this date; browser testing remains deferred. This record
does not qualify every local feature or claim LXC/provider deployment.

## Evidence

- `pnpm build`: passed, Vite 6.4.1, 1919 modules. Main chunk ~612 KB minified;
  bundle-size warning remains. Assets built before standalone tests.
- `pnpm exec tsc --noEmit`: passed after adding missing declarations for Node-facing
  HR, HR documents, platform, agreements and quoted native-job handoff boundaries.
- Initial `pnpm test`:186/190 passed. Three old quote-migration expectations omitted
  additive v5; standalone still used the deliberately retired technician creation API.
- Affected suite after fixes:40/40 passed.
- Final complete `pnpm test`:196/196 passed, zero failed/skipped/cancelled/todo.
  Node v26.7.0 local environment; Debian/Node24 deployment compatibility is separate.

New `tests/agreements.test.mjs` covers native identities and FK protection; immutable
revisions; null/zero pricing; dates and cross-customer scope validation; people-only HR
write rejection; exact actor/content retry; stale version rejection; late scope-write
rollback; exact review context; native label changes; withdraw/resubmit/approval;
new revision invalidating current review; review transition/readiness/sequence gates;
rollback after review write when acknowledgment fails; archive and bounded lookups;
repeat module initialization and foreign-key integrity.

Those tests found and fixed an extra placeholder in the review INSERT and inconsistent
initial/replayed agreement read-model shapes (undefined storage field and SQLite row
prototypes). The repository now returns consistent plain read models for journaled
acknowledgments. Applied migration SQL was not changed by these fixes.

Standalone now asserts the legacy technician-create endpoint409, creates reviewed
staff through HR, verifies the same native technician UUID in the Staff roster, then
runs its native Dispatcher/restart/live-backup checks. Existing quote migration tests
retain their preservation assertions and now expect all actual additive versions1–5.

## Remaining scope

Green existing tests do not establish qualification for all accumulated changes.
Add dedicated HR lifecycle/adoption/documents privacy and byte/retry tests, platform
custom-field/metadata policy and atomicity tests, Finance receipt/credit/reconciliation
invariants, prospect conversion, native quote-to-Job handoff, spreadsheet math and
weekly-accounting tests as appropriate. Add actual populated pre-v2 agreement
migration/restore coverage and HTTP streamed-body/CSRF/private-response checks.

Browser pointer/keyboard/mobile and nested modal qualification remains deferred.
No real QuickBooks/provider posting, customer acceptance, external communication,
vehicle location hardware, refrigerant regulatory conclusion, LXC or Kubernetes
qualification follows from this test run. Publication awaits review of the exact
changed tree and adequate feature-specific coverage; Features.md remains incomplete.


## HR/personnel and platform follow-up

Full `pnpm test` now passes209/209 (zero failed/skipped/cancelled/todo) after adding
`tests/hr-personnel.test.mjs` (8) and `tests/platform-custom-fields.test.mjs` (5).
No production source changes were needed for these checks. Earlier196-test result
above remains the initial qualification checkpoint, not the latest test count.

HR/personnel coverage includes existing technician adoption without lost Job/account
identity, office-to-field promotion, inactive availability/access denial while account
links remain retained, open-work acknowledgment, supervisor-cycle rejection, HR-only
scope, exact replay and late acknowledgment rollback. File tests compare original
bytes, shared physical dedup with isolated HR metadata/IDs, unauthorized reads/uploads,
filename sanitization, signature rejection, actor/bytes/name-bound replay, archive/
restore/stale edits, immutable history and safe HTTP download headers. A streamed
multipart upload changing the actor before body completion is rejected with no write.

Platform tests cover false/zero/empty-text/null preservation and unchanged native UUID,
foreign-key deletion protection, HR-only/member denial, strict types and cross-object
field rejection, stale definition/value versions, retained inactive choice keys,
archival/history, exact actor/content replay and rollback after current-head/value
write when acknowledgment fails. Metadata validates actual agreement draft ownership
and rejects missing dependencies or removal of protected native identity.

These tests do not qualify every boundary. Add populated pre-feature backup/restore,
limits/history pagination, complete streamed JSON/CSRF matrix and browser keyboard/
mobile/recovery checks as required. Finance credits/legacy reconciliation, native
prospect/job handoff, costing math and weekly accounting still need dedicated new
coverage; tests of older related features do not substitute for those requirements.


## Finance and costing follow-up

Full `pnpm test` now passes220/220 (zero failed/skipped/cancelled/todo), adding
seven `tests/finance-accounting.test.mjs` cases and four worksheet cases in
`tests/sales-estimating.test.mjs`. No production source change was needed for this
increment. Earlier test counts remain chronological checkpoints.

Finance checks cover separate partial receipts/credits; combined settlement and
both retained reversals; pure-credit closure with no invented receipt/paid date;
Receivables/customer balance agreement; original net/tax ceilings and outstanding
balance caps; company date rather than UTC date; stale source and duplicate-reference
rejection; exact actor/content replay; role/HR denial; invalid-cent totals;
late acknowledgment rollback; unresolved legacy paid flags, reviewed reopening and
partial evidenced receipt; and independent customer PO/check/collections references.
Fixtures use valid native legacy unmanaged Jobs; the service-billing review gate is
not removed or bypassed to manufacture an invoice against an enrolled visit.

Costing tests independently assert material100USD +30%=130USD unit selling base,
unchanged acquisition cost, quantity/headcount, one flat Misc per row, discount then
exact per-line tax rounding; labor OT1.5x/DT2x across technician/apprentice/after-hours;
shared labor-category tax; tax exclusion for permit/license/subcontractor/fuel/distance/
service; legacy calculationVersion1 compatibility; pending unknown costs/totals under
worksheet version3. Material completeness still requires a catalog identity. These
are fixture tax treatments, not real-state tax/legal verification.

Remaining: HTTP/private/streamed-body matrix, populated migration/restore, live bank/
QuickBooks reconciliation, browser forms/spreadsheet interactions and native prospect/
accepted-quote handoff qualification. A green arithmetic test is not proof of real
supplier prices, payroll cost, recognized revenue or regulatory tax correctness.


## Native Sales handoff follow-up

Full suite now passes228/228, zero failures/skips/cancelled/todo. TypeScript passed
again. Eight new `tests/sales-native-handoff.test.mjs` cases exercise real module
composition on isolated SQLite fixtures, not mocked native record creation.

Prospect tests verify one native account with two locations (Company timezone) and
reviewed contact, stage remaining open, no Job/communication, existing-account reuse
without profile overwrite, duplicate/owner/stale/wrong-location rejection, exact retry
and late acknowledgment rollback across Customer/Site/Contact/Opportunity writes.
These tests found and fixed one extra bound SQL argument in the existing-contact
duplicate lookup; migration SQL was not changed.

Accepted-quote tests configure issuer/policy, save/offer/deliver/record acceptance,
then call the native Service Job handoff and read the Dispatcher board API. They
verify one Job on the existing Customer/Location/Equipment, native quoted category,
unassigned/empty time, retained frozen offer, same Opportunity Won, exact replay,
new-key duplicate conflict, ordinary-member/stale/remapping/wrong-acceptance rejection,
legacy invoice shortcut DB protection and no external communication. Injecting a
late journal failure rolls back Job, service contract, conversion, native number
counter and Won stage. Cancellation retains the accepted quote, Won history and the
same cancelled Job, including exact retry and retained conversion event.

This is automated service/API proof on fresh fixtures. It does not establish real
pointer dragging after conversion, cross-process concurrent-write behavior, populated
pre-v5 upgrades/restores, all execution-evidence cancellation blockers, verified
customer signatures, email delivery or production deployment. Those gates remain
open. Actual accepted scope/progress invoice generation remains unimplemented; the
legacy shortcut is blocked deliberately to prevent double billing.


## Weekly and Sales projection checkpoint

Full working-tree suite now passes234/234, zero failed/skipped/cancelled/todo.
Six new tests cover native weekly per-Job aggregation and company-date cells,
overnight daily-allocation warnings without invented splits, exact-midnight end
handling and report-backed weekly totals. Sales checks cover ten-row bounded
Customer360 activity/quote summaries with full counts and no embedded message
bodies; stage age follows stage-changing audit sequence rather than timestamp
maximum, notes or updated_at, with explicit missing/mismatch/future/invalid states.

Preparing an isolated publication snapshot from reviewed src/docs/tests/Features.md
changes. Local editor settings and the untracked password-reset helper are excluded.
The snapshot must pass build/type/tests separately before branch publication. No
browser or live-provider completion is implied by that checkpoint.


## Proposed-contract PDF checkpoint

Working-tree full suite now passes240/240; TypeScript and production build pass.
Six new document cases verify immutable exact-revision source/hash binding, historical
PDF retention and new-revision replacement, upload/read boundaries, pending-review
withdrawal, actor/content retry, late blob/association rollback, deduplication,
byte-exact safe/private downloads, CSRF, actual multipart success and writer revocation
during a streamed body. Previous234-test checkpoint is published as9b02259432f5d0a5049e510a6566d95dc88ea79d.

The local preview restarted successfully after backing up both databases at
/private/tmp/ofs-dev-20261125/before-hr-platform-1795665087296. Agreement review v2
and proposed-document v3 now load in the preview. This is startup evidence, not
populated real-contract upgrade/restore or user-file interaction proof. No contract
PDF or review decision was uploaded to the preview as part of these checks.

Browser/mobile/file-picker/modal qualification, malware scanning, authoritative
accepted artifacts, customer signature/acceptance, contract activation and recurring
work generation remain open. No production LXC/provider posting is claimed.
