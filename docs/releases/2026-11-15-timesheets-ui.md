# Timesheets layout polish (UI-009)

Timesheets now group Previous / Monday date / Next with matching control heights
and a This week shortcut. Approval status sits in the header, while the entry view
selector sits with Time entries. Labels distinguish the full-week totals and
approval from the selected-day list. Day names replace bare ISO filter labels.
An empty daily selection points to other days instead of suggesting an approved
week needs new labor. Submission/review panels use shared cards and aligned actions.

The same technician IDs, report labor, weekly submissions, approval versions,
export route, and permissions remain authoritative. No pay or bill calculation is
added; daily selection does not alter weekly approval or totals.

## Verification

Real Chrome desktop and responsive-device emulation at 400 CSS pixels: grouped
controls fit, status and Refresh wrap, totals stack, review/history controls remain
reachable, and daily filtering works by keyboard. A recorded approved fixture week
retained its full-week totals/status when a day with no entries was selected.
TypeScript, production build and existing timesheet regression checks accompany
the release. This is browser emulation, not physical touch or screen-reader proof;
UI-008 and broader payroll/accounting qualification remain open. The LXC was not
updated during this work.
