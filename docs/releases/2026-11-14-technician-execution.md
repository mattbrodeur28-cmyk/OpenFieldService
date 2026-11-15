# Technician execution pilot and company timezone

Standalone native work orders now offer an opt-in PJSA → post-work report →
supervisor completion workflow. Immutable template/report revisions, attributable
technician labor and audit share the original customer/job/equipment IDs. Required
equipment prevents Step2 draft/submission; report snapshots preserve serial/site
context. Approved actual visits replace estimates on Dispatcher without overwriting
the original schedule. Completion remains separate from billing and payroll.

Company Settings under the bottom-left profile Settings popup stores the default
IANA timezone. Running Dispatcher, report entry, Sales follow-ups and new sites use
it. Routine timezone labels are removed; explicit DST warnings remain. Changes
require administrator review/acknowledgment, preserve wall-clock schedule values,
validate existing active intervals and retain audit. Single-company storage only;
white-label tenant isolation remains future architecture work.

Verification: 69 tests pass on local macOS Node26.7.0; TypeScript, production build
and whitespace checks pass. JS420.46kB (125.51gzip), CSS78.92kB (14.25gzip). Tests
include immutable safety/report/equipment evidence, required equipment, scoped
actors/delegation, overlap/rollback/version conflicts, late-entry chronology,
midnight/DST actual projections, company persistence/cross-connection changes,
authorization revocation while reading HTTP bodies and audit rollback.

Real Chrome input on disposable localhost preview: filled and saved report draft,
reloaded, submitted report, reviewed/approved completion; observed completed native
job and Dispatcher actual 21:21–21:31 ten-minute visit, nine worked minutes, one-minute
break, eight requested billable minutes, preserved120-minute estimate and read-only
actual detail. This fixture predated the equipment gate and is retained as historical
missing-equipment evidence. New required-equipment behavior is verified by backend
and SQL tests, not a completed browser equipment-linked visit. After restart,
inspected Company Settings showing America/New_York and verified routine timezone
labels absent from Dispatcher. Did not change the company setting through Chrome;
settings mutations are covered by service/HTTP tests.

Remaining M13: dedicated technician/crew scoping across legacy APIs, attachments,
customer acknowledgment, multi-tech/phase/timers, timesheet periods/review/export,
full billing readiness/invoice handoff, truck stock and offline writes. Existing
Member job APIs remain company-wide. No payroll or QuickBooks posting, safety/EPA
qualification, live LXC deployment, full accessibility review or field-device proof
is claimed. Keep pilot enrollment off production billing jobs until billing handoff
is available. Follow documented backup and matched-binary/database recovery.
