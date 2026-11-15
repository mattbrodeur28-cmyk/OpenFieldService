# Dispatcher density and native timesheets

Dispatcher uses inline totals, a compact date/view toolbar, concise service-hours
status, optional pipeline, expandable advanced filters and on-demand instructions.
Routine timezone labels stay hidden. Shared focus is neutral; dropdown selected
values stay on one line and coarse-pointer controls retain44px minimum targets.
Native job pointer move/resize and overlap lanes are retained. The initial changes
were saved locally by Matt in c804ed895dc57415cee63eeac3de247e19a51e53.

Timesheets is a Field Service navigation item using the same report labor ledger.
Daily/weekly views keep worked time, recorded breaks and requested billable time
separate. Retained submissions, supervisor review and SQL period locks prevent late
source changes; audited reopening preserves prior approvals and requires renewed
review. Approved CSV exports use the retained source snapshot with formula escaping.
No wages, pay treatment, payroll posting, payment or invoice is generated.

Local Chrome: previously inspected compact Dispatcher, dropdown neutral focus,
filter expansion and full-width timeline after pipeline collapse. On Nov15 opened
Timesheets, observed the existing preview report’s nine worked minutes, one break
minute and eight requested billable minutes; submitted with supervisor reason,
approved and refreshed to verify persistence. This is disposable local evidence,
not employee payroll or live LXC qualification. Reopening/export have behavioral
service/SQL tests; browser correction/export proof still pending.

Owner feedback remains open as UI-009: improve the flow/alignment of Previous/week/
Next navigation and distinguish approval status from Daily View. Functional checks
do not close visual polish, mobile/AT qualification or the complete TECH-007 scope.
Preserve company timezone and private configuration during upgrade; backup both
SQLite databases. New checksummed timesheet migration1 and additive correction
migration2 retain approvals and source evidence. Restore matching databases and
application version for rollback; do not delete migration ledgers.

Validation on Nov15:75 automated tests pass, TypeScript and whitespace checks pass,
and production build passes (JS430.07kB/128.08gzip; CSS82.36kB/14.75gzip). Audit
rollback, stale/conflicting sources, locked late entries, retained approvals after
reopening and escaped CSV snapshot export are covered. The local original Matt
commit is preserved on archive/matt-dispatcher-c804ed8 when publishing through the
connected GitHub tool because shell GitHub credentials are expired.
