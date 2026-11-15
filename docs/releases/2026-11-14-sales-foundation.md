# Sales foundation — 2026-11-14

Status: implemented and locally verified; LXC deployment not performed here.
Baseline: 46a19ee. Release commit: the commit containing this record.
Feature IDs: SALES-001, SALES-002, SALES-003. M4 remains in progress.

## Delivered

A separate Sales app contains opportunities, commercial/residential prospect fields,
customer/site/equipment links, ownership, expected values/dates/probability, next
steps, internal notes and retained activity. Administrators configure ordered stages,
probabilities, entry requirements and allowed transitions. Members change their own
opportunities. Lost/reopen requires reasons; Won is reserved for quote conversion.

Kanban supports whole-card pointer moves, owner/value/date/search filters, per-stage
totals, weighted forecast and a semantic table/keyboard form alternative. USD integer
cents are kept separate from revenue. Transactional expected versions, audit and
checked additive migrations protect persisted records. No Sales jobs/quotes are
fabricated. Quotes, approvals and conversion are the next planned Sales increments.

Shared Select/Dialog wrappers now own explicit accessible IDs across Preact portals.
Sales stage/note changes preserve the mounted editor. Pointer-opened cards restore
focus after closing. Existing controls retain token styling and reduced-motion rules.

## Evidence

- Final typecheck, production build and all 38 automated tests passed on
  macOS / Node 26.7.0; hosted Debian/Node 24 CI and LXC deployment are separate.
- Production bundle: JavaScript 374.68 KB / 111.74 KB gzip; CSS 78.42 KB /
  14.14 KB gzip. No new runtime dependency or second renderer was added.
- Six Sales/migration tests cover ownership, role denials, stage requirements and
  transition restrictions, loss/reopen, Won rejection, exact money validation and
  filters, cross-customer references, protected links, version races using separate
  SQLite connections, transactional audit, restart preservation, migration checksums
  and asynchronous permission changes. Existing account tests now exercise Sales
  through real login cookies and verify owner lookup excludes emails/viewers.
- Desktop Chrome / disposable fixture: created a $12,500 prospect at 10%; dragged
  its card body from New to Qualified (25%); reload preserved the stage and the
  $3,125 weighted forecast. Keyboard Space/Down/Enter chose Site visit (40%) and
  the save displayed $5,000 forecast. A $13,000 minimum-value filter hid the
  $12,500 record and zeroed the totals; reducing the minimum restored it. Added an internal note and observed its author,
  content and stage history. Renamed the first pipeline stage to Incoming, saved
  configuration and read back the new label. Selected the semantic list alternative.
- At 400px responsive emulation with dark mode, opened the Sales opportunity sheet;
  the single-column fields/title remained readable and the sheet scrolled within the
  viewport. Returned emulation to desktop/default afterward. Physical touch and
  screen-reader qualification are not claimed.
- Re-tested the explicit label fix: stage options had concise correct accessible
  names; Escape closed Select independently, and closing the final editor returned
  focus to the card button. Earlier auto-generated labels included unrelated text;
  wrapper-owned IDs correct that observed issue.
- Dispatcher follow-up: at 400px, dark mode and reduced motion enabled, opened the
  alternate appointment editor, saved the fixture assignment and observed success
  with focus returned to Edit assignment. Physical touch remains outstanding.

Fixture data is synthetic and local at 127.0.0.1:4310. No live company records or
provider credentials were changed. Tests/build are not Debian deployment proof.
Shared focus changes still need broader browser/screen-reader qualification.

## Operations and next work

No new environment variables or dependencies. Startup adds Sales tables and seeds
only default pipeline configuration. Existing jobs/customers/accounts remain intact.
Use the existing [LXC update guide](../../deploy/ACCOUNTS.md#update-an-existing-lxc),
back up both databases/private configuration, then verify health and journal after
restart. Sales uses the same single persistent service database. Multi-replica
Kubernetes is not qualified. See [ADR-0004](../architecture/decisions/0004-sales-foundation.md)
and [API/operating limits](../api/sales.md).

Next: Sales activities/tasks, quote generation/revisions/approval policy, and
accepted quote-to-job conversion with idempotency. CRM contacts/Customer 360 and
QuickBooks remain separate unfinished roadmap work. Retain production backups for
any rollback; do not remove module tables to bypass migration checks.
