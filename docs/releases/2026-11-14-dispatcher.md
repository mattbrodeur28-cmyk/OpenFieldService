# Dispatcher and workspace UI — 2026-11-14

Status: core implemented and locally verified; LXC deployment is not performed here.
Baseline: b78acc0. Release commit: the commit containing this record.

## Delivered behavior

Dispatcher adds a 24-hour technician Gantt, date navigation, zoom/snap controls,
searchable/paged open/active pipeline, resource filters, explicit availability,
workload metrics and a list/form alternative. The entire job card can be dragged;
the right edge is wider and stretches the visible appointment in real time. Move
previews show their proposed time range. A tap opens the assignment sheet, with a
keyboard alternative. The server approves changes before replacing saved records.

Transactional conflict/version checks, override reasons/audit, durable SSE revisions,
reconnect/poll fallback and legacy job API protections are implemented. Offline
scheduling is disabled. Full semantics and limits: [Dispatcher API](../api/dispatcher.md).

Shared UI adds Radix Select, DropdownMenu and Tooltip; local Sheet, Textarea,
Checkbox, Card, Badge, Avatar, Notice, Loading/Skeleton/EmptyState and semantic Table
components. Team conversation actions/filter/composer and Builder provider controls
adopt them. Profiles/settings/integrations retain the prior shared Dialog/Tabs.
Unexpected non-JSON account responses now produce an actionable HTTP error instead
of exposing a JSON parser exception. Sales pipeline/quotes-to-job are added to M4
planning; Sales functionality is not part of this release.

## Verification

- Final formatted source: typecheck, production build and all 32 automated tests passed
  on macOS / Node 26.7.0. Hosted Debian/Node 24 CI is separate.
- Final production bundle: JavaScript 347.88 KB / 103.94 KB gzip; CSS 72.73 KB /
  13.24 KB gzip. The build guard confirms a single Preact browser runtime.
- Dispatcher tests cover competing same-version writes, separate storage connections
  assigning overlapping jobs, rollback, availability, inactive/closed protection,
  override scope/audit, role checks, migration repeat/reopen, DST boundaries and
  layout interval rules.
- SSE test covers durable cursor catch-up, heartbeat, a subsequent change and stream
  closure after session revocation. Standalone HTTP tests exercise old job routes,
  invalid time, missing/stale versions, restart preservation and backup integrity.
- Desktop Chrome on a disposable local fixture: dragged a card body from pipeline
  onto Blair at 13:00; stretched 60 to 120 minutes using the wider right edge;
  conflicting move onto Alex was rejected; reload retained Blair/13:00/120 minutes.
  Opened the assignment sheet, used Tab/Space/Up/Enter to choose Alex, saved the
  nonconflicting 13:00 assignment and observed the updated workload.
- Browser exposed missing drop handling during rerenders. Global pointer listeners
  now preserve completion/cancellation across card updates and consume the final
  pointer coordinates. Real pointer drag/drop passed after that fix.
- Team channel menu opens in a body portal and accepts keyboard selection. Existing
  Dialog/Tabs light/dark/400px/reduced-motion evidence is in the previous UI release.

Physical touch, screen readers, broader browsers and the new Dispatcher at narrow
width/dark/reduced-motion still need explicit qualification. Do not substitute
build tests or the earlier account-dialog checks for that evidence. UI accessibility
acceptance remains open for those checks. No provider credentials were changed and
no live LXC data was used. The local preview uses synthetic customer/job records.

## Deploy and rollback

Use [the existing LXC update procedure](../../deploy/ACCOUNTS.md#update-an-existing-lxc).
Before the first Dispatcher deployment, privately edit /etc/openfieldservice.env
and set DISPATCH_TIMEZONE=America/New_York (or the company's actual IANA zone).
Keep PUBLIC_URL=https://field.mattshomelab.net and existing encryption/provider keys.
Do not recreate databases. Startup applies the additive module migration; healthz
and journal checks should follow restart. Back up both service/workspace databases
and private configuration first. Future migrations must preserve the applied
checksum. Reverting to pre-Dispatcher code is a maintenance/backup restore operation,
not a safe live downgrade that preserves the new optimistic version contract.

See [ADR-0003](../architecture/decisions/0003-dispatcher-module.md). Kubernetes,
PostgreSQL, maps/routing, shifts/breaks, multiple visits and Sales implementation
remain roadmap work.
