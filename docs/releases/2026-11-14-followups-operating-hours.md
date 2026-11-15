# Sales follow-ups, native customer links and operating hours

Branch: feature/debian-standalone. Standalone Node/SQLite only.

## Changes

- Sales calls/meetings/site surveys/tasks with assigned users, UTC due/reminder times,
  completion/cancellation outcomes, authors, audit and expected-version checks.
- Minute/focus in-app reminders, follow-up inbox, permission-checked Team message
  references and native customer → opportunity reverse links.
- Weekly company service hours, dated exceptions, all-day Gantt shading/warnings,
  explicit On-Demand emergency/T&M with audited admin after-hours approval.
- Shared service work categories on original jobs: Unclassified, On-Demand,
  Quoted Work / Project and PM. Duration label states estimated slot minutes.
- Native-record architecture decision and detailed technician/timesheet/truck/RMS
  roadmap. These execution/actual-time/billing/stock/compliance features remain planned.

## Evidence

Automated tests exercise private Team links with real authenticated roles; atomic
activity/audit rollback; separate-connection stale edits; completion/reminders;
calendar/offset validation; shared customer renames; service hours and dated holidays;
9 PM normal rejection versus deliberate emergency approval; legacy direct-write
protection; stale settings; HR and inactive-account denial. Final suite/build results
are 47 passing tests, clean TypeScript checking, successful Vite production build
and clean git diff whitespace checks. Runtime: local macOS Node 26.7.0; Linux/LXC
execution is not asserted. Final bundle: 391.86 kB JS (117.00 kB gzip), 78.70 kB
CSS (14.20 kB gzip).

Native Chrome local-preview proof: created a follow-up, completed it with an outcome,
read back author/time/history; enabled service hours and retained three old Saturday
appointments as after-hours warnings; rejected a normal 21:00 move; selected
On-Demand and approved with reason; read back 21:00/category after page reload.
Inspected the assignment Sheet screenshot. These are local preview checks, not live
LXC, touchscreen, comprehensive assistive-technology or Kubernetes qualification.

## Deployment/recovery

Follow deploy/ACCOUNTS.md update procedure: back up both SQLite files and protect
private configuration before pulling/building/restarting. New checked additive
Sales v2, Dispatcher v2/v3 and service-work v1 migrations preserve old records and
old migration checksums. Service hours stay unenforced until deliberately enabled.
A prior application that does not know new migrations cannot be assumed to start;
rollback requires matching code and a verified pre-upgrade backup during maintenance.
No dependencies, external messages, provider credentials or live-service data were
changed by the feature tests. Local preview fixtures were modified deliberately.
