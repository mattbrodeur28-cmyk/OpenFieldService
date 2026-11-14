# M0 / M1 workspace delivery — 2026-11-14

Status: implemented; local checks passed. Live LXC deployment unverified.
Commit: pending publication; use the commit containing this record as the release identifier.
Previous published baseline: `1c881c6ff2f120b85c9b08a2f998f41a0c190be2`.

## Scope

M0 documentation: module map, glossary, delivery/ADR templates, API map, security
matrix, recovery runbook and this release record. M1: bottom-left account popup,
Settings sections, HR people administration, app navigation, modern team channel,
conversational Builder and online storage-banner removal. UI direction and a
NumberFlow adapter are included; broad shadcn/Radix adoption is not complete.

Schema: additive `workspace.sqlite` users.is_hr integer default 0. Existing service
schema/UUIDs are unchanged. Builder drafts add revision metadata and source checks.
Migration ledger version: none yet (M2); schema is source-defined.

## Validation and acceptance evidence

- Full candidate: typecheck and Vite production build passed; all 28 tests passed
  on macOS / Node 26.7.0. Debian/Node 24 hosted CI is a separate qualification.
- Account tests cover HR ordinary-user creation/edit/reset, privileged target and
  self protections, HR configuration/Builder denials, roster-only conversation
  reads, profile privilege injection and a target-promotion/password-reset race.
- Builder fixtures cover cumulative two-file edits, saved revision chains,
  allowlisted automatic file selection and stale-source rejection. Diff tests
  reconstruct both versions and preserve unchanged lines.
- Desktop Chrome local fixture: profile/Settings/storage sections, nested Outlook
  dialog, Escape and focus return verified. Online storage banner absent.
- Sent a team message using Enter; reloaded and read it back from the channel.
- Builder unconfigured-provider/disabled-submit and Advanced selection UI verified.
- Chrome responsive mode at 400px: Builder and account Settings layout inspected,
  navigation opened, profile opened/dismissed with focus return. This is browser
  emulation, not a physical mobile-device test.
- Dark mode, reduced-motion visual behavior, screen reader checks, provider-backed
  Builder generation and complete keyboard workflows remain unqualified; UX-006
  and the remaining UI compatibility/migration gates stay open.

## Deployment and recovery

Follow [the operations runbook](../operations/runbook.md) and back up both databases
and encryption configuration before update. Record actual deployed commit and health,
login, populated-record and browser results after restart. No live update is performed
by this source release. Use the previous baseline plus retained DB backups if a
rollback is necessary; assess post-backup writes before restoring.

## Limits and deferred work

No real AI/OAuth provider qualification performed. Native dialogs remain the current
implementation; shadcn/Radix Preact/portal compatibility is still a required UI gate.
Search covers 100 recent channel messages; updates poll every five seconds. Builder
proposes existing frontend file changes only; export requires review, application
uses the existing non-root validation command. Attachments/mentions/unread and
isolated Builder previews remain planned. No Dispatcher/CRM/contracts/QuickBooks or
multi-replica Kubernetes functionality is claimed by this release.
