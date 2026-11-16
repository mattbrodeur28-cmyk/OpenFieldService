# Exact saved-bid review and pricing controls

Company Settings now has an explicitly configured, versioned margin/discount policy
with optional all-quote manual review. No policy is seeded. Saved quote revisions
show exact-cost/net financial comparison, deliberate pricing flags, qualification
and immutable approval/revocation history. Owners/Admins acknowledge every current
flag and record a rationale; Members inspect only their own opportunity quotes.
Zero-cost/no-charge work cannot qualify silently, and exact cross-products prevent
a tiny loss from passing through rounded margin display.

Quote migration v3 is additive and leaves applied v1/v2 SQL unchanged. Manual events
bind immutable quote, policy and evaluation versions; quote/policy changes cannot
inherit an old signature. Revocation is explicit. Current version/event checks reject
competing reviewers, and actor-bound replay recovers an original committed result.
Policy/event journal failures roll back all their writes. The new modal command hook
shares the existing uncertainty classification and blocks unsafe closure/navigation;
its recovery state is memory-only, not a durable offline claim.

Contract coverage includes missing policy, exact/equal/discount/zero-value thresholds,
complete acknowledgment, approval/revocation/replay, stale competing writes, policy
changes, new quote revisions, immutable audit, roles/owner/body races, pagination,
restart, rollback and a genuine populated v2→v3 upgrade retaining templates/native
provenance and original replay. All 171 regression tests pass, TypeScript is clean and the production build
succeeds for the release snapshot. Existing main-bundle size warning remains.

Browser/nested-modal/checkbox/keyboard/reload/narrow-device/print qualification is
still pending. No live LXC/provider/Postgres/multi-replica proof is claimed. Pricing
control does not offer or accept a quote, alter lifecycle status, create work/stock/
POs/invoices or send customer communication. SALES-007/015 remain open for full
options/burden/allowance modeling, customer document workflow and browser gates.
