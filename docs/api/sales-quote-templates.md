# Reusable quote templates

Company-scoped standalone Sales configuration under `/api/sales/quote-templates`.
Templates are reviewed starting blueprints, not jobs, CRM copies, accepted quotes,
stock reservations, pricing approvals or offers. Scope text is reused verbatim;
admins must review it for customer-specific details before publishing.

## Access and endpoints

Active Owner/Admin manages versions. Active Sales Members may read shared company
templates and apply them to opportunities they currently own. Viewer has no access;
HR does not grant template administration. Standard Sales sessions, temporary
password, CSRF header and 50KB streamed-body limits apply. Every awaited mutation
body is followed by a fresh actor check. Internal template responses are no-store.

- `GET /quote-templates?search=&segment=commercial|residential&state=active|archived|all&page=1`:
  `{rows,total,page,pageSize:25}`; default state active. Search is bounded to200 chars.
  Invalid page/state/segment400. At most1000 template heads in this release.
- `GET /quote-templates/:id?revision=<positive integer>&historyPage=1`:
  `{template,history,historyPage,hasMoreHistory}`. Template `version` is selected,
  `currentVersion` is head; history25/page. Includes internal config, attributed
  review and source quote/revision IDs. Unknown template/revision404. Read access
  to a shared template does not grant access to its original private quote.
- `POST /quote-templates`: strict `{id,requestKey,expectedVersion,name,title,active,
  reviewNote,source:{quoteId,revision}}`. IDs/keys UUID; expectedVersion0 for new,
  otherwise current head. Name1–120, reusable title1–200, review note10–2000 chars.
  Source must be an authorized saved native quote revision. Returns `{template}`.
  Updating, archiving and restoring all append an immutable version. Reuse its
  source reference when only changing name/title/active/review; revise scope/lines
  by saving a reviewed quote and publishing that saved revision as the new source.
- `POST /quote-templates/:id/instantiate`: strict `{expectedTemplateVersion,
  opportunityId,expectedOpportunityVersion}`. Requires an active current template,
  an open authorized native opportunity, matching segment and current versions.
  Returns `{template:{id,version,name},document:{title,scope,exclusions},lines,
  materialSnapshots,warnings}`. This endpoint writes no business/configuration row.

## Native data and pricing

Template revisions copy only reusable scope/exclusions and line blueprint fields.
Each line keeps an FK to its native material, plus the immutable original quote
line through quote/revision/line UUIDs. Customer/site/equipment identity, contacts,
validity/pricing dates, tax profiles, stock evidence and material cost overrides do
not become template defaults. Non-material estimated costs, selling rates,
quantities/headcount, discounts and explicit travel-group/fuel inclusion remain
reviewable defaults. No current tax policy is inferred from the source quote.

Instantiation allocates fresh line UUIDs without creating a quote or opportunity.
Material unit costs use current native company inventory snapshots inside the same
service transaction. No legacy catalog-price fallback or fake zero cost is used.
Unknown cost is null plus a warning; UI leaves the cost field blank until reviewed.
Missing callback503, unavailable material409, unusable cost422. Source/template/
opportunity stale versions, archived templates, closed work and segment mismatch409;
unauthorized owner403. Labor and other defaults must be reviewed before calculation.

The workbench preserves chosen billing/validity, confirms scope/line replacement,
invalidates previous price review, and requires calculation before saving. It sends
only `{id,version}` as optional quote `template`; the friendly display name is
server-owned metadata and is excluded by the shared UI input adapter. Source
provenance is informational, not a promise that later edited lines still match it.

## Transactions, replay, migrations and operations

Quote migration v2 is additive; v1 SQL/checksum remains unchanged. It adds head,
immutable template revision/line/request tables plus immutable quote-revision →
template-version references. FKs preserve native materials, source quote revisions
and original line IDs. Update/delete triggers reject historical evidence changes.
Migration and command work is synchronous in the service database; no awaits or
nested transactions hold SQLite locks. No schema downgrade is implied.

A template save writes head, revision, native line references and actor-bound request
acknowledgment in one transaction. Exact actor/content retries return the original
result; reused changed content409, different actor403, stale expectedVersion409.
Current admin authorization is always required for replay. Failed journal/provenance
writes roll back everything. Quotes capture optional template provenance in their
existing save transaction. Historical references survive archival/rename; explicit
null detaches only the newly saved quote revision. Omitted legacy fields do not
change old command hashes or original replay results.

Save dialogs retain an uncertain command for exact retry and guard navigation.
An unsuccessful recovery cannot establish that the original write failed, including
permission-revocation errors; editing stays locked until an acknowledgment resolves
it. This memory-only safeguard is not durable offline recovery.

Back up the service database before upgrading. Restore a matching backup and app
revision to recover; retain all earlier migration files. The migration regression
builds a genuine populated v1 schema, upgrades it, compares prior native/quote rows,
checks FKs and replays an original acknowledgment without changing its hash.

## UI and outstanding qualification

Routes: `/sales/quotes/templates` for search/history/administration; saved quote
workbench → Save as template; quote workbench → Start from a template. Members may
apply shared templates; management buttons are Owner/Admin only. Templates are
within Quotes, preserving the requested module navigation.

Unit/API/upgrade proof is separate from browser proof. Real pointer/keyboard,
archive/restore UI, uncertain-save dialog, narrow device and reload qualification
remain pending while browser access is unavailable. No live LXC/PostgreSQL/Kubernetes
qualification is claimed. Reusable issuer/branding/layout templates, alternates,
margin/discount approvals, PDF, delivery/acceptance and conversion remain open.
