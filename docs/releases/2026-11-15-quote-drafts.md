# Saved internal quote draft foundation

Sales can now save internal draft estimates with title, scope, exclusions, validity,
exact prices, reviewed billing-profile version, and native material cost evidence.
Each save creates an attributed immutable revision and native material line
references; current opportunity ownership controls access. Actor-bound request
replay and stale-version checks prevent duplicate saves and lost edits. Head,
revision, lines, and request acknowledgment commit in the same service transaction.

This implements persistence for part of SALES-005/006/013, not their complete
workflows. The Quotes workbench UI, templates, alternates, customer document/export,
offering/delivery, acceptance, accepted quote-to-job conversion, and procurement
allocation remain planned. No inventory movement, invoice, PO, customer acceptance,
external message, or payment is created by saving a draft. Never expose internal
costs or review notes through a future customer-facing document without a deliberate
transformation and permissions review.

The existing pricing preview reuses a clearly named caller-owned synchronous
transaction contract; nested transactions and async work are not introduced.
Existing Sales and profile migrations retain their SQL. Additive quote migration
v1 is included in the normal service database backup. Restore matching backups
rather than dropping evidence tables to roll back.

## Verification

143 regression tests pass, including six new quote tests covering revision retention,
exact pricing, native material references, restart, ownership changes, immutable
history, actor-bound retries, stale versions, opportunity binding, closed/non-draft
guards, rollback on failed journal insertion, strict schemas, streamed limits and
actor revocation during a body read. TypeScript and production build pass; the
existing large main-bundle warning remains.

The disposable local preview was backed up before applying v1. Native customer,
site, asset, job, material, opportunity, and billing-profile counts matched after
upgrade; foreign-key checks were clean. These are local/fixture results. No LXC,
provider, customer acceptance, physical-device, Postgres, Kubernetes, multi-replica,
or full quote workbench qualification is claimed.
