# Dispatcher API and operating rules

The standalone Node/SQLite deployment owns `/api/dispatch/*`. Wrangler/D1 does not
host this module. Requests require an active user session, a completed password
change and, for mutations, `X-Requested-With: OpenFieldService`. Viewers read;
Members (including HR) schedule work; Owners/Admins configure resources and approve
overrides. HR does not confer administrator privileges.

## Contract

| Method/path | Input and result |
| --- | --- |
| GET `/board` | `date=YYYY-MM-DD`, `pipeline=all/open/active`, `assignment=all/assigned/unassigned`, `search`, `page`. Returns date/timeZone/now/revision, resources, assigned jobs, 25 pipeline records, pipelineTotal/page/pageSize. |
| PUT `/assignments/:jobId` | JSON `technicianId` (UUID or null), `date`, `time` (HH:mm), `duration` (15–1440), `expectedVersion`; optional `override`, `reason`. Returns updated job, revision and auditId. |
| PUT `/resources/:technicianId` | JSON `date`, `expectedVersion`, `dispatchTeam`, `territory`, `skills` (up to 20), `availability` (null or `{available,start,end}` in minutes). Returns ok/revision. |
| GET `/audit` | Owner/Admin only; latest 100 assignment audit records including actor, before/after and override reason. |
| GET `/changes?after=N` | Returns revision/changed; bounded revision comparison. |
| GET `/events?after=N` | Server-sent `schedule` revision notifications and heartbeat. `Last-Event-ID` takes precedence on reconnect. Re-fetch the board snapshot after a notification. |

Invalid input returns 400, permissions 403, missing job/resource 404, stale version,
overlap or availability conflict 409, and an oversized board 422. A board supports
up to 500 resources and 2,000 assigned jobs per day; it fails explicitly beyond
that scope. Search is limited to 200 characters. Resource filters are applied by
the client within that bounded board; pipeline search/filter/pagination are server-side.

`open` means scheduled/confirmed; `active` means in_progress. Completed/cancelled
jobs are excluded from the pipeline and locked against rescheduling/reopening once
managed by Dispatcher. No new business statuses are invented.

## Schedule semantics

An existing job currently has one assigned technician and one same-day time block.
This module projects that block as an appointment; it does not introduce a separate
multi-visit appointment entity. Multi-resource jobs/visits are later work.

`DISPATCH_TIMEZONE` is one IANA timezone for the company; default UTC. Configure it
before scheduling production work. Existing dates/times are interpreted as stored
wall-clock values; changing the timezone does not convert them. Nonexistent or
repeated DST times and blocks crossing a DST transition are rejected. Split those
visits into unambiguous blocks. No job can extend beyond midnight.

Availability is an explicit declaration for one resource/date, or unknown. Unknown
is displayed as not declared, not a fabricated shift. Dispatch team/crew, territory
and skill labels are resource metadata, separate from permission-bearing workspace
teams. Matching labels do not automatically enforce a skills policy. No routing,
travel estimates, breaks, utilization percentage or GPS tracking is inferred.

Overlaps use half-open intervals: 09:00–10:00 and 10:00–11:00 are adjacent. Active
jobs overlap only when technician/date match and intervals intersect. Owners/Admins
may override overlap or declared availability with a 10–1,000 character reason.
The approval is scoped to the exact technician/date/time/duration and is audited;
it cannot authorize a later move. Inactive technicians, stale versions, invalid
intervals and closed jobs remain protected.

## Persistence and concurrency

`dispatch/storage.mjs` owns a checksummed, transactional module migration. It adds
metadata, profiles, availability, events, audit tables and guarding triggers without
replacing jobs/customers. Assignment checks, metadata, job update, version increment,
event and audit commit in one BEGIN IMMEDIATE transaction. Conflicting/stale writes
roll back. Legacy job API writes to managed schedules require `expected_version`
and validate the company timezone. SQL triggers also enforce overlap/availability
against managed appointments. Direct SQL is an administrative interface, not an
API contract; do not use it to bypass versioned endpoints.

Every job update increments its schedule version conservatively. `GET /api/jobs/:id`
exposes schedule_version/dispatch_managed in standalone mode. The old job-detail UI
submits that version. Re-fetch after 409 rather than automatically replaying a write.

SSE contains revision numbers only, checks session validity on each loop and resumes
from durable revisions. The browser additionally polls every five seconds and
refreshes on focus/reconnect. Refreshes are deferred during a drag. The UI shows a
proposed position/stretch immediately, but persists on drop and renders the server
result. Failed drops keep the previous saved assignment. Escape cancels a drag.
Offline or failed-board states disable schedule writes; changes are not queued.

Resource changes have durable revision events; the assignment audit is not a
complete enterprise audit for every entity. Event/audit retention and PostgreSQL
repositories remain M2 work. SQLite requires a single persistent instance; multiple
Kubernetes replicas sharing a SQLite file are not qualified.

Metrics are sums/counts of visible active jobs/resources. Scheduled hours sum job
minutes and include approved overlaps. Overlap count counts jobs involved, not
conflict pairs. Pipeline count reflects current pipeline filters and can include
work outside the selected board date. These are operational measures, not revenue.
