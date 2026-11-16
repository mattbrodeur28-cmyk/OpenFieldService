# Supplier-pending quote materials — 2026-11-15

Material selection is now a directly searchable native Inventory combobox with
bounded results, keyboard selection and pointer selection. Internal quote drafts
can retain an unlisted item/quantity and unknown supplier cost or selling price.
Nulls stay unknown in saved revisions and readback. Exact known subtotals remain
separate from final amounts. Approval/document/template gates prevent incomplete
pricing from being presented as finished work. Resolution links the native material
and saves another immutable revision. Template options also refresh immediately
after successful publication. Quote input focus uses a neutral outline.

## Verification

- 178 full regression cases pass; TypeScript is clean and the production build
  succeeds. The exact staged snapshot is checked before publication.
- New tests cover null persistence/known subtotals, known selling with unknown cost,
  hard approval/export/template gates, history and supplier resolution, validation,
  current ownership, HTTP read/write, native-reference rejection and exact replay.
- Real Chrome testing on an isolated copied local database at port 4311 covered
  Inventory text search, Down/Enter selection, pointer selection, complete quote
  calculation/save/reload, unlisted material creation with blank rates, pending
  revision save/reload, read-only earlier revision history, and native material/rate
  resolution into a third revision. Unknown amounts displayed Pending and customer
  document/template/approval buttons were disabled for the incomplete revision.
- Fixture: Q-000001 with native labor and material lines; priced revision 1 total
  $150.00, supplier-pending revision 2 total null, resolved revision 3 total $155.00
  with native company-stock cost $14.80. These are disposable fixture values, not
  company pricing recommendations. The user's port-4310 demo was not used for
  these mutations. No supplier, accounting or customer communication was sent.
- Browser publishing of a reusable fixture template succeeded before this change.
  Full template application/archive, narrow viewport, screen reader, touch and print
  qualification remain open. Browser approval-event creation remains open.
- The normal port-4310 local demo was restarted after separate business and workspace
  backups. Every service table was compared by row count and row-content digest
  against the pre-restart backup; all stayed unchanged, foreign keys were clean,
  and `/healthz` returned 200. No pending quote was inserted in that demo.
- No LXC, PostgreSQL, Kubernetes or provider qualification is implied. Existing
  production-build main-chunk size warning remains.

See [workflow](../product/supplier-pending-quotes.md) and
[API/compatibility](../api/sales-pending-pricing.md). Broad Sales milestone boxes
remain open until their remaining offering/acceptance/options/conversion work passes.
