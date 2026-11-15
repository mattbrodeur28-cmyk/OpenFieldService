# Service identity API

Standalone Node/SQLite routes under `/api/service`; active signed-in session and
completed password change required. Writes require X-Requested-With:
OpenFieldService. Identity lookup supplies only active writer IDs/names to service
and Sales; workspace auth remains authoritative for role/active/session state.

## Technician account links

GET `/technician-users` is Owner/Admin only. It returns `technicians` with
technician_id, technician_name, active, user_id (nullable), version, and eligible
`people` with id/name. Up to 500 technicians/eligible accounts; larger sets fail
422 instead of silently omitting records. No emails/passwords/session data exposed.

PUT `/technician-users/:technicianId` accepts strict JSON `{userId:UUID|null,
expectedVersion:integer}`. Only Owner/Admin may link/unlink. The technician and
selected user must be active; a user must be Owner/Admin/Member. An inactive
technician can be unlinked. HR is not service access administration. One user maps
to one technician, one technician to one user. An absent mapping has version zero;
first save is version one. Stale/duplicate links return 409. Linking does not
create a user, change an account role or imply a verified trade certification.

Mapping, version and audit commit in a single business-database transaction.
Unlinking retains the row and audit; once mapped, technician deletion is restricted
to preserve identity history. Deactivate/archive the technician instead. User IDs
reference workspace identity through validated contracts, not cross-file SQL FKs.
Do not hard-delete historical users. PostgreSQL consolidation remains ARCH-005.

GET `/my-technician` returns only the current account's mapped active technician,
or null. Viewer/inactive/temporary-password actors cannot become execution authors;
ordinary users cannot enumerate other account mappings via these endpoints.

## Job execution author contract

`service.executionActor(user, jobId, reason)` is a reusable synchronous guard for
forthcoming PJSA/report/time services. Call inside the same transaction as saving
evidence. It requires an active writer, an active assigned technician, and a UUID
mapping from the actor to that technician. It returns actor user ID and assigned
technician ID. Equal names do not imply identity. Inactive/unassigned resources fail.

An Owner/Admin acting for another technician requires an explicit 10–1000 character
reason. The guard returns delegation/reason; the eventual evidence write MUST
persist both actor and technician, reason, revision and audit atomically. The guard
itself does not invent or submit a report. HR cannot delegate as a supervisor.

The old job APIs remain company-wide for existing Member accounts. Mapping is not
a least-privilege technician role or a retrofit of legacy endpoint permissions.
TECH-001 stays open until assigned-work/crew permissions and relevant UI/API scoping
are implemented. PJSA/report/billing gates and timesheets remain TECH-002–011.
