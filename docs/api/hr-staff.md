# HR staff and native technician lifecycle

2026-11-25 working source; tests, browser and populated migration qualification are
deferred. This is not a released/deployed HR system or a complete offboarding flow.

## Ownership and adoption

HR → Staff owns employee name/work contact, title, employment status, supervisor,
optional start date and field-technician availability. A technician is a native
service-resource extension of the employee, not a separately editable person. An
employee may have no technician and no login. Staff creation does not create a
workspace account or assign an account role.

Additive `_hr_staff_migrations` v1 adopts every existing technician by its unchanged
UUID; the staff ID matches that native technician ID. It preserves native jobs,
timecards, custody and technician/user links. It infers no employment start date or
supervisor from record creation time, display names or email. Existing native active
state maps to Active/Inactive employment; retained technician role remains enabled.
An attributed system-adoption event distinguishes this from reviewed hiring history.

HR profile changes synchronize the native technician's public work name/contact
and effective active state in the same transaction. Database guards reject direct
changes conflicting with the HR master. The retained native technician row is a
controlled operational projection; there are not two editable employee masters.
A defensive insert trigger adopts native technician imports by UUID. It does not
make generic technician creation an authorized public workflow.

## API and permission

Base `/api/hr`, active Owner/Admin or Member with HR capability. Viewers and ordinary
Members403, missing session401, temporary-password actors403. HR gains no Finance,
Integration, credentials or service-supervisor permission. Private/no-store;50KB
streamed body limit; mutation CSRF header; current actor checked after awaited body.

- `GET /staff?page=1&search=&status=all`:25 profiles/page with total, native technician
  availability, current account-link UUID, supervisor and open-job count. Literal
  search≤200 across name/work email/phone/title. Status all/active/on_leave/inactive/
  terminated. Existing technicians appear even without login accounts.
- `GET /staff/options?search=`: first100 active supervisor matches plus hasMore;
  explicitly narrow when truncated. The chosen supervisor is revalidated on save.
- `GET /staff/:id`: current profile or404.
- `GET /staff/:id/history?page=1`:25 retained events/page plus hasMore. System
  adoption and reviewed profile/employment changes remain distinguishable.
- `POST /staff`: strict command `{id,requestKey,expectedVersion,name,email,phone,
  title,employmentStatus,startDate,supervisorId,technician,color,reason,
  acknowledgeOpenWork}`. UUID ID/key, initial version0 then exact current version;
  name1–200, email empty/valid≤254, phone≤60, title≤200, valid calendar start date or
  empty, supervisor UUID/null, color #RRGGBB, reason10–2000 chars. Technician flag
  controls field availability, rather than deleting an existing resource.

Supervisor must exist and be active when assigned. Self/cyclic chains reject;
more than1000 levels requires review. Start date is recorded employment metadata,
not automatic future activation or payroll eligibility. Status has no legal/payroll
calculation or autonomous onboarding effects.

## Native resource and open-work rules

If technician is selected for a new staff member (or an office employee becomes a
technician), create exactly one native `technicians` row using the staff UUID.
Disabling later retains that row and its history/account mapping. Effective native
availability requires both Active employment and enabled technician role. Leaving
or terminating employment never silently unassigns work, deletes reports, removes
truck custody or reassigns a vehicle.

If an available technician with open scheduled/confirmed/in-progress work becomes
unavailable, require explicit acknowledgeOpenWork after review. Open-job count is
checked inside the write transaction; current assignments remain and Dispatcher
emits its existing native-resource update event. Dispatchers must deliberately
review/reassign work. Supervisor relationships, profile/version, native resource,
audit and acknowledgment commit atomically.

Standalone Node intercepts old POST `/api/technicians`, PUT/DELETE
`/api/technicians/:id` with409 and directs callers to HR. Native GET/list/dropdown
contracts keep their current IDs. `/technicians` is a read-only operational list;
Add/empty-state creation, identity edits and account-link setup live in HR instead.
The legacy Wrangler compatibility API is not the qualified HR deployment target;
complete API-contract consolidation remains M2/ARCH-008.

## Identity, access and retention

Technician login links keep the existing Owner/Admin-only service identity command,
now reachable from HR. HR staff management does not grant permission to link an
account to job execution. Workspace login access remains a separate panel with its
existing HR ordinary-user protections. Office employee-to-user linking beyond the
native technician link remains open; users are not automatically treated as employees.

Changing employment status **does not revoke login sessions** or change account
roles. The UI explicitly tells the operator to review workspace access separately.
Atomic employee/access offboarding across the current two databases requires later
ARCH-005/006/HR-002 work; do not describe termination here as completed offboarding.
Employee and technician records/history cannot be hard-deleted through this workflow.
Use status changes. [Private personnel documents](hr-personnel-documents.md) attach
to this staff identity; onboarding remains HR-002.

## Recovery and deferred qualification

Same actor/key/validated content returns its original acknowledgment after current
permission checks. Different content409; another actor403; stale profile409. The UI
locks uncertain submissions and retains the exact command in memory. No durable
mobile/offline queue or cross-file transaction is supplied. Back up both database
files and private configuration consistently before updating; restore matching code
and databases rather than deleting ledgers/triggers to bypass migration checks.

Before release cover populated adoption with unchanged technician IDs/jobs/history,
new employee/no-login and technician creation, office-to-field promotion, concurrent
writes and exact retry, HR scope/privileged account boundaries, supervisor cycles,
active/open-work acknowledgment, retained custody/account links, direct-write guards,
foreign-key deletion protection, failed-write rollback, Dispatcher refresh and
cross-file access limitations. Real pointer/keyboard/mobile UI and production LXC
qualification remain deferred. Local preview HR-404 recovery restarted the stale
Node process and read back `GET /api/hr/staff` through the Vite proxy as JSON200.
That narrow diagnosis does not qualify the lifecycle or browser behavior.

Automated qualification resumed after this source increment. The HR/personnel and
platform follow-up now contributes thirteen focused tests to a209/209 passing suite.
See [exact coverage and remaining gates](../releases/2026-11-25-automated-progress.md).
Browser, populated upgrade/restore and deployment qualification remain separate.
