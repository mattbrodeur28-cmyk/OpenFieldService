# Technician identity foundation

Standalone feature increment following native Sales/service hours. Adds explicit
existing-login ↔ existing-technician mapping; no duplicated person/job records.
Technicians screen exposes an admin-only Link user accounts Sheet. HR cannot grant
these links. A shared identity `activeWriters` lookup serves Sales and service.

Checked additive service-identity v1 migration stores unique UUID links/version and
retained audit. Unlinking preserves history and technician deletion is restricted;
deactivation is the supported history-preserving action. Application validation
crosses the current workspace/business DB split; no cross-file FK is claimed.

The tested execution-author guard requires active assigned mapping or deliberate
Owner/Admin delegation with a reason. Future evidence services must use it inside
their write transactions and persist the returned attribution/reason. No PJSA,
report, timesheet, billing or legacy job-screen permission change is claimed.

Behavioral tests cover same-name identities, unique links, stale edits across
connections, reconnect persistence, inactive/viewer/HR permissions, unmapped or
inactive assignment, delegation, rollback/audit and role revocation during request
body reads. Real authenticated account tests confirm owner linking and HR denial.
Final checks: 52 tests pass; TypeScript, production build and git whitespace
checks pass. Local macOS Node 26.7.0; JS 394.13 kB (117.91 kB gzip),
CSS 78.70 kB (14.20 kB gzip). Native Chrome retry succeeded on the disposable localhost preview: opened
Technicians → Link user accounts, read both technician rows with labeled selectors
and disabled unchanged Save buttons, and inspected the rendered Sheet screenshot.
No browser mapping writes occurred; mapping mutations are covered by authenticated
HTTP and application-service tests. Use the existing two-database backup/update procedure before LXC
upgrade. No production mapping or deployment was performed.
