# Typed custom-field source foundation

M2 ARCH-016, 2026-11-25 working source. Backend and Settings definition editor are
implemented locally along with native record-value editing. Testing,
migration preservation and runtime qualification remain deferred. This extends native records; it does not implement custom objects, generic
CRUD, workflows or Twenty API compatibility.

## Supported records and ownership

Owner/Admin-only annotations on `crm.customer`, `equipment.asset`, `sales.opportunity`
and `service.job`. The native UUID/owning record remains unchanged. A controlled
reference table uses actual native customer/asset/opportunity/job foreign keys and
an exclusive object/reference constraint, so a value cannot silently attach to the
wrong record type or survive deletion as an orphan. Stored values reference their
object's field and the exact definition revision. Annotated native records are
therefore protected from hard deletion; an archive/retention workflow must preserve
this history rather than disabling foreign keys. HR/private employee data, invoices,
receipts, stock ledgers and accepted document mutation are not generic annotations.

`custom-fields-domain.mjs` owns strict validation and authorization;
`custom-fields.mjs` owns commands/version/replay; `custom-fields-repository.mjs` is the
SQLite adapter and synchronous unit-of-work boundary. Its private native SQL binding
is an allowlist, never a client-provided table/column. Initialize native modules
before this adapter; startup runs additive `_platform_custom_field_migrations` v1.
Applied migration strings remain immutable. Backup/restore both databases before
upgrading; no PostgreSQL or distributed transaction qualification is claimed.

## Definition API

Base `/api/platform`; all reads private/no-store, active Owner/Admin only. HR gains
no schema or business-field administration. Writes require CSRF header, bounded50KB
JSON and actor recheck after body await. Unrecognized fields are rejected.

`GET /objects/:key/fields?includeArchived=false` returns `{objectKey,fields}`. At
most100 total definitions per object, including archived; no hidden truncation.
`POST /fields` accepts `{id,requestKey,expectedVersion,objectKey,key,label,description,
type,options,active,reason}`. UUID IDs/key; initial expectedVersion0; field key begins
custom_ followed by a letter and up to42 lowercase letters/digits/underscores;
label1–100, description≤1000, reason10–2000. Supported optional types: text, integer,
boolean, date, select. Field ID/object/key/type are immutable after creation. Changing
a label or description creates a new retained version; archiving preserves data.
Type conversion and required-field enforcement across native writes remain open.

Select options max50: `{key,label,active}`, key lowercase letter then≤39 lowercase
letters/digits/underscores, label1–100. Keys and case-insensitive labels unique, at
least one active choice. New versions may rename/deactivate existing options or add
choices, but never remove old keys. New writes cannot select an inactive option;
previously stored values and their definition revisions remain readable.

`GET /fields/:id/history?page=1` returns25 immutable definition versions/page with
actor/reason/time and hasMore. Neither definition nor value history has a delete API.

## Native record values

`GET /objects/:key/records/:id/fields` returns current native label, objectKey,
recordId, custom-value version (zero before first write), current definitions including
archived, and stored `{fieldId,fieldVersion,value}`. Scope is explicitly
admin_only_custom_annotations. Missing native record404; unsupported object400.
Reads never create a reference/value row. Native label changes remain live; no
Customer/Job identity is copied into an editable metadata master.

`POST /objects/:key/records/:id/fields` accepts `{id,requestKey,expectedVersion,
changes,reason}`, with event UUID, request UUID, custom-record expected version and
1–100 unique `{fieldId,fieldVersion,value}` patches. Reason10–2000. Both current
record version and each definition version are rechecked inside the transaction.
Archived/missing/wrong-object fields reject. Values are strict JSON:

- text: string≤2000, including empty string;
- integer: safe integer, including negative/zero;
- boolean: true or false, without string/number coercion;
- date: valid YYYY-MM-DD calendar string;
- select: exact active option key;
- null: explicit clearing for any type, retained as a recorded null value.

False/zero remain values, never treated as missing. Unmentioned fields remain
unchanged. Save native reference, current value heads, next custom-record version,
immutable before/after event and acknowledgment atomically. Event captures field
key/label and both prior/applied definition versions for historical interpretation.
Custom fields do not recalculate quotes, change accepted scope, approve reports,
post tax/payroll or alter native stage/price/identity fields.

`GET /objects/:key/records/:id/field-history?page=1` returns25 retained change events
with actor/reason/time, before/after and definition references. Same actor/key/validated
command returns its original acknowledgment after current permission; changed content
409, other actor403. Stale definitions/value heads409. Identity collisions reject.
No external side effect, offline queue, search index or bulk export is supplied.

## Metadata and remaining gates

The read-only registry still reports metadataWrite:false for native module/schema
registration and generatedCrud:false/customObjects:false. `/modules` separately
reports customFieldRead/customFieldWrite and the exact four supported object keys.
This does not open schema editing or field-value access to ordinary module users.
ARCH-017 owns granular object/record/field policies; schema and native-record
annotations stay admin-only until that layer is qualified. Saved views, relation
fields, indexed search/export, backfills, generic custom objects, required/native
write validation remain separate ARCH-016/018/021 work.

Deferred qualification: strict type/false/zero/null preservation, select archival and
history, immutable keys/type/identity, cross-object and native foreign keys, stale/
concurrent writes, actor-bound exact retries, event collisions, late-write rollback,
permission changes, bounded history and populated backup/migration/restore. No tests,
type checks, builds or runtime requests were run for this source increment.


## Settings definition editor (source, unqualified)

User menu → Settings → Custom fields is visible to Owners/Admins. Choose Customers,
Equipment, Sales opportunities or Jobs / Work Orders, optionally include archived
fields, then create or review a definition. The panel reads the same native platform
API; it stores no parallel schema in browser storage.

The modal edits labels/descriptions, active/archive state and choice labels/active
state. Keys and type are fixed for saved fields. Existing choice keys remain retained;
only unsaved new choices can be removed. Each save needs a reason and current
version. Retained history shows earlier definitions, actor, reason and recorded time
in bounded pages. Choice keys/labels, limits and invariants are revalidated by the
owning backend, not trusted to the UI.

Uncertain submissions freeze edits and retain the exact request in memory, guarding
close/navigation until recovery. Definition creation does not populate existing
records, enforce required fields, change domain calculations or permit ordinary-user
schema editing. Native record-value controls are described below.
No tests, build, browser QA or live definition mutations were run for this UI work.


## Native record-value editor (source, unqualified)

Owner/Admin users can open **Custom fields** from Customer detail, Equipment detail,
Job / Work Order detail and an existing Opportunity sheet. Creating an unsaved native
record does not create annotations; first save the record through its owning module.
Ordinary members, HR-only members and viewers see no annotation control. The API
independently enforces permissions on every read/write.

A shared editor loads the native label, optional fields, current values and version
on demand. Text, whole-number, yes/no, date and choice controls keep their JSON types.
No value is explicit: clearing writes null, while zero, false and an empty text value
remain distinct values. Dates and choices must still pass server validation; an
inactive saved choice remains visible but cannot be newly selected. Archived fields
and their stored values remain readable and cannot be edited. Labels use the current
definition; the saved definition version is displayed and retained history binds
before/after values to their respective revision versions.

Only changed active fields are patched. Unmentioned values remain untouched. A
reason is required; saves bind both custom-record and changed-definition versions.
On success, the returned native record-field projection replaces the local state,
showing the persisted acknowledgment. This does not save unrelated changes in an
open native editor. Uncertain requests retain the exact body and lock edits/closing;
stale-context errors require closing/reloading before review and another save.
No offline queue or automatic merging of concurrently changed values is implied.

Bounded history pages show actor, reason, time, custom-record version and retained
before/after details. Direct native foreign keys, current definition checks and atomic
value/history/request writes remain the backend authority. No sample values were
written while implementing these controls. Tests, type checks, build and browser
qualification remain deferred, including keyboard choice behavior, nested Opportunity
sheet dialogs, null/false/zero handling, stale-source recovery and role changes.

Automated qualification resumed after this source increment. The HR/personnel and
platform follow-up now contributes thirteen focused tests to a209/209 passing suite.
See [exact coverage and remaining gates](../releases/2026-11-25-automated-progress.md).
Browser, populated upgrade/restore and deployment qualification remain separate.
