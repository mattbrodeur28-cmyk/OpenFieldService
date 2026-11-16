# Reusable quote template library

Owners/Admins can publish immutable reusable templates from saved quote revisions,
revise them from a reviewed quote, search/history them, and archive/restore them.
Sales writers apply current active segment-matched templates to authorized native
opportunities. Application creates fresh quote-line IDs, reads current native stock
costs, keeps unknown costs unresolved, and requires new price review. Template
provenance stays attached to saved quote revisions without copying CRM records.

The additive quote v2 migration preserves applied v1 SQL, native material/source
line FKs and historical quote data. Actor-bound replay, stale writes and rollback
are exercised through service and HTTP fixtures. A genuine populated v1 database
upgrade preserves old rows, passes FK checks and replays the original old command.
Shared test fixtures keep quote and template tests on the same native contracts.

Client save commands explicitly strip template display names. An additional recovery
fix prevents a failed retry after permission revocation from claiming the original
uncertain write failed. Quote and template dialogs share that classification rule;
both preserve exact pending commands in memory rather than claiming durable recovery.

Verification includes template history/archival, pagination, current material costs,
labor/headcount defaults, unavailable stock pricing, actor/owner/segment/stage checks,
streamed-body actor recheck, immutable provenance, rollback and legacy migration/replay.
All 161 regression tests pass, TypeScript is clean, and the production build
succeeds for the release snapshot. Existing main-bundle warning remains; templates are in the lazy Quotes chunk.

Browser template flows, dialogs, download/print and narrow-device qualification are
not claimed. The latest browser access host was unavailable. SALES-005/006/007/013
remain open: issuer/layout templates, alternates, approval policy, offered identities,
PDF, explicit customer delivery/acceptance and native job/procurement handoff remain.
No live LXC/provider/multi-replica qualification is claimed.
