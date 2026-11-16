# Frozen quote offers and recorded responses — 2026-11-15

Sales now freezes a reviewed offered revision rather than treating a mutable draft
or pipeline move as a customer offer. Versioned issuer/terms configuration lives
under Profile → Settings. Each offer retains exact customer-field JSON, escaped
HTML, both SHA-256 hashes, issuer/recipient/native identity and pricing-control
provenance. Delivery, recorded external acceptance/decline, expiry, withdrawal and
new-draft revision commands append protected evidence with exact command replay.
Accepted work remains locked; job conversion and procurement are subsequent work.

## Verification

- 190 full regression cases, TypeScript and production build pass against the staged
  release tree before publication. Existing main-bundle size warning remains.
- Twelve lifecycle tests cover explicit issuer configuration, immutable artifacts,
  changed identity/issuer retention, stale/current policy checks, incomplete pricing
  rejection, authorization/replay, evidence timing/attestation, response races,
  revision behavior, company-calendar expiry, rollback, exact authenticated HTML,
  streamed reauthorization/body bounds, pagination, native relationship integrity
  and populated v3-to-v4 migration.
- Real Chrome on isolated copied port-4311 databases: configured fixture issuer and
  explicit manual-approval policy; acknowledged the pricing flag and saved approval;
  froze Q-000001 revision3 ($155.00); inspected the solid, scrollable frozen document
  preview; recorded synthetic delivery and acceptance evidence; reloaded and verified
  accepted state and locked editors. No real customer communication or agreement.
- A second domain-arranged disposable quote Q-000002 verified the correction that
  manual approval immediately enables offer readiness, without a manual refresh.
  Pending in-memory command guards are shared with the reviewed quote/modal boundary.
- Port-4310 normal demo was stopped and separate service/workspace backups taken.
  The populated upgrade preserved all 113 preexisting service tables by row count /
  content digest (old migration rows compared separately), appended only migration4
  and six empty lifecycle tables, passed foreign-key checks and returned health200.
  No issuer, pricing policy or customer response was seeded into that demo.
- No hosted LXC database or provider account was changed. Real email delivery,
  customer identity/signature verification and PDF rendering are not established.
  Browser decline/withdraw/revise/expiry variants, historical local-time/DST form
  interaction, screen-reader/touch/narrow viewport and print/PDF qualification remain
  open; unit/HTTP tests must not be substituted for those browser gates.

See [product workflow](../product/quote-offers.md) and
[API, permissions and recovery](../api/sales-quote-lifecycle.md). Broad SALES-006
remains open for PDF/export qualification and provider/customer-facing acceptance
work; SALES-008/009 conversion and SALES-016 procurement remain open.
