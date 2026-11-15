# Internal quote workbench pilot

The lazy-loaded Quotes app now provides a paginated draft list, deep links, native
opportunity and material search, reviewed billing-profile selection, and line-by-line
estimating. Supported categories: technician/apprentice/after-hours labor, materials,
service, permits, licensing, distance/fuel, and subcontractors. Only Labor and
Materials use configured tax rules. Costs, prices, discounts, tax, total and gross
margin come from the existing exact server calculator; internal cost evidence stays
private to authorized Sales writers.

Scope, exclusions, validity, pricing date, draft revisions, and the native quote API
are connected. Recalculation is required after input edits. Pending cost refreshes
block calculation/saving/history changes, stale asynchronous revision responses are
ignored, and the saved command is retained for an exact retry after an uncertain
response. Navigation guards protect unsaved work; this is not durable offline
storage. Current profile changes are shown explicitly rather than rewriting a saved
revision. No new business records are copied and no stock is consumed by estimating.

Owner-scoped opportunity/material lookups and searchable billing profiles are
bounded server reads. Material refresh uses company inventory evidence; no stock
cost means an explicit reviewed override is still required. The shared HTTP wrapper
now preserves HTTP status on errors so the workbench can distinguish definite
validation failures from an uncertain transport/server response.

## Verification and remaining gate

Automated coverage includes exact UI decimal serialization through the real quote
API fixture, owner-scoped lookup permissions and pagination, current material cost,
profile lookup, actor revocation, request replay, stale versions, immutable history,
and rollback. TypeScript, production build, and the full regression suite accompany
the staged release. The existing main-bundle size warning remains; the Quotes code
and CSS are loaded as a separate chunk.

Real Chrome verified the Quotes list/new route, native opportunity/profile dropdown
selection, scope/exclusions entry, 2.500 labor hours with explicit $40 cost/$120 sell,
and adding/opening the next line's category menu. The Materials selection click was
not executed: automatic approval review could not complete because of an account
usage limit. Material selection, Calculate/Save/reload, revision viewing, navigation
prompts, and narrow-layout browser checks are still pending. The later timing fixes
are type/build checked, not claimed as browser-qualified.

This pilot does not complete SALES-005/006/013. Templates, alternate options,
margin/discount approval policy, customer documents/PDF, offering/delivery,
acceptance, accepted quote conversion, and procurement allocation remain open.
No LXC/provider/physical-device/multi-replica qualification is claimed.
