# Maintenance plans and idempotent work generation

M5 CONTRACT-003/004 increment, 2026-11-26. Maintenance plans define equipment-specific
recurring tasks against an agreement's selected scope. Work generation creates native
PM Jobs idempotently from due occurrences. This is not entitlement allocation, billing,
revenue recognition, holiday rescheduling, provider delivery or production qualification.

## Ownership and scope

Plans belong to one native Agreement and may reference only equipment already in that
agreement's current selected scope; every save revalidates the equipment still belongs
to the agreement customer and a selected location. Plans do not copy customers, sites
or assets. Generation asks the Service module for the native Job, so job numbering and
PM classification stay in the single shared Jobs ledger (`_service_work.category='pm'`);
Agreements owns only the due-work link. Authorization, billing entitlement and generated
maintenance work remain separate states.

## Plan lifecycle

Each plan has an immutable revision history (a new revision per save, including archive/
restore). A revision stores title, description, frequency, first-due date, horizon days,
seasonal months, the ordered checklist and the exact equipment scope. The checklist is
the versioned template: an ordered list of labels each marked required or optional. The
current head carries the archived flag and latest revision number; equipment scope is a
current mirror used for due-work computation.

- `frequency`: `monthly | quarterly | annual` (3/12-month calendar steps, day clamped to
  the month length).
- `firstDue`: the first occurrence date.
- `horizonDays`: the plan's intended lookahead, retained and validated. Preview/generate
  take an explicit `from`/`to` Company-date window from the operator rather than
  silently scheduling past the horizon.
- `seasonalMonths`: optional unique months1–12. When present, occurrences fall only in
  those months (for example `[1,3]` yields January/March service).

## Due work and generation

Occurrences are computed per plan asset from `firstDue` stepping by frequency and filtered
by seasonal months and the requested window. An occurrence is already satisfied when a
`_agreement_due_work` row exists (generated Job or audited skip).

Generation requires, for each due date: an authorized agreement whose accepted term is
active on that date, the equipment still in the accepted frozen scope, current native
ownership/location unchanged since acceptance, and the equipment not retired. Occurrences
that fail those gates are returned as `blocked` with a reason and are never silently
created. Generating inserts one unassigned native Job (scheduled, category `pm`, no
technician, zero price) and a due-work link in the same transaction.

Idempotency: `UNIQUE(plan,asset,due_on)` plus the actor/content-bound request ledger make
repeating a generation return the original acknowledgment and create no second Job.
Skipping an occurrence records an auditable exception (actor, reason) instead of a Job.

## API

Under `/api/agreements/:id/maintenance`, session authenticated, private/no-store. Current
Owner/Admin write; ordinary business readers read. HR capability alone grants no write.

- `GET /plans`: active plans with current revision, checklist and native equipment scope.
- `GET /plans/:planId`: one plan detail; 404 when it does not belong to the agreement.
- `GET /plans/:planId/history`: immutable revisions newest-first.
- `POST /plans`: create (`expectedVersion:0`) or update (`expectedVersion` = current
  version) with a strict full command:
  `{id,requestKey,expectedVersion,title,description,frequency,firstDue,horizonDays,
  seasonalMonths,checklist:[{label,required}],assetIds,archived,reason,reviewAttested:true}`.
  Title1–200, description≤2000, horizon1–730 days, firstDue a valid Company date,
  1–100 checklist items each label1–200, 1–500 unique equipment, reason10–2000.
- `GET /preview?from=&to=`: read-only pending occurrences in the window (default
  Company date through +366 days) split into `due` and `blocked` with reasons; no writes.
- `POST /generate`: `{id,requestKey,from?,to?,reason,reviewAttested:true}` creates Jobs
  for the `due` occurrences; `blocked` occurrences remain untouched.
- `POST /skip`: `{id,requestKey,planId,assetId,dueOn,reason,reviewAttested:true}` records
  one auditable exception for a genuine scheduled occurrence.

## Storage, recovery and remaining gates

Additive `_agreement_draft_migrations` v6 creates plan heads, immutable revisions,
current-scope links and the due-work ledger with real Agreement/Asset/Job foreign keys
and immutability triggers. v1–v5 SQL stays unchanged. Generated Jobs and due-work links
commit atomically; a late acknowledgment failure rolls both back and leaves accepted
scope untouched. Back up both application databases before upgrading.

Remaining: holiday/timezone shifting of due dates, checklist completion evidence links
into the execution workflow, entitlement usage/allocation (CONTRACT-005), renewal-driven
plans, historical ownership reconstruction, populated v5→v6 upgrade/restore, concurrency,
browser workbench and real LXC/provider qualification. Do not mark M5 complete from a
green due-work preview or a created PM Job.
