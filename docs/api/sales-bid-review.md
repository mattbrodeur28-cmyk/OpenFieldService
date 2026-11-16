# Bid review and pricing approval API

Internal standalone Sales module. Company policy is explicitly reviewed by an
Owner/Admin; absent policy remains null/unconfigured. A pricing qualification is
not a quote offer, customer acceptance, recognized revenue or an inventory movement.

## Policy

`GET /api/sales/review-policy?page=1` (Owner/Admin) returns `{policy,history,page,
hasMore}` with25 immutable revisions/page. Null policy means unconfigured; no hidden
margin/discount default is applied.

`POST /api/sales/review-policy` is strict `{requestKey,expectedVersion,config}`:

- UUID requestKey; expectedVersion0 for first save, current head thereafter.
- Config: `schemaVersion:1`, `minimumMarginBasisPoints` and
  `maximumDiscountBasisPoints` (integers0–10000), `requireApprovalForAll` boolean,
  `reviewNote`10–2000 trimmed characters. These are company choices, not tax/legal
  or current market-rate recommendations.
- Returns `{policy}`. Head update, immutable attributed revision and actor-bound
  acknowledgment share one synchronous transaction. Changed key content409;
  different actor403; stale version409. Current admin authority is required on replay.

Current policy applies to current-rule evaluation of all saved revisions. Old policy
and approval evidence never changes. Changing a policy makes prior manual approval
non-current. A deliberately configured within-limit policy may independently qualify
an unflagged quote without using that old signature.

## Saved revision assessment

`GET /api/sales/quotes/:id/review?revision=<optional positive integer>&page=1`
returns current head/status, selected saved revision, evaluationVersion, current
policy limits, stable flags, latest event/sequence, financials and up to25 events
for that selected revision. Current active Sales writer access and opportunity
ownership are required; Owner/Admin may inspect any. Viewer/HR adds no access.
Invalid IDs/pages/revisions400; absent quote/revision404; foreign owner403.
All review/policy responses are private/no-store. Standard auth, temporary-password,
CSRF, streamed50KB body limit and post-await current-actor rechecks apply.

Assessment uses saved exact cents and pricing inputs, not current material prices:

- `quote:manual_review` when requireApprovalForAll is true.
- `quote:margin_unavailable` when net selling value is zero.
- `quote:minimum_margin` if `(net-cost)*10000 < net*minimumMarginBasisPoints` using
  BigInt products. Display truncation cannot turn a one-cent loss into approval.
- `line:<UUID>:zero_cost`, `line:<UUID>:no_charge`, and
  `line:<UUID>:discount_limit` for zero rounded cost/net or a per-line discount above
  the configured maximum. Threshold equality is allowed. Every flagged line needs
  deliberate acknowledgment; no cost/tax/price is invented by assessment.

States: unconfigured; approval_required; approval_stale (earlier manual approval
under different policy/evaluation); approved (latest approval is current); revoked;
within_policy (configured, no required flags, no current manual approval needed).
`qualified` is true only for approved/within_policy. Explicit revocation blocks that
revision even when its prices would otherwise pass. A new quote revision has no
inherited event. Pricing qualification is independent of lifecycle status; future
offering/conversion must additionally enforce current lifecycle/identity rules.

## Approval and revocation

`POST /api/sales/quotes/:id/review` is Owner/Admin only, strict:
`{id,requestKey,expectedQuoteVersion,expectedPolicyVersion,expectedEventSequence,
action,approvalId,acknowledgedFlags,note}`.

- UUID id/requestKey; positive quote/policy versions, nonnegative event sequence.
- action approve: approvalId null; acknowledgedFlags contains every current flag
  ID exactly once, with no extras. Empty list is valid only when no flags exist.
- action revoke: approvalId must name the latest approval for this saved revision;
  acknowledgedFlags must be empty. An explicit10–2000 character review/revocation
  note is required for either action.
- Only the current internal draft revision can be mutated. Unknown/unconfigured/
  changed policy, stale revision/event sequence, mismatched flag acknowledgment,
  obsolete revocation target or reused event ID409. Unauthorized role403.
- Returns `{review}`. This is a retained acknowledgment of that command, not a
  guarantee that no later quote/policy/event change has occurred. Clients refresh
  assessment after success.

Events retain actor, exact quote/policy/evaluation version, action, rationale,
acknowledged flag descriptions and revocation target. Trigger-protected history and
request rows cannot be updated/deleted. Each append plus actor-bound acknowledgment
is atomic. A failed journal insert rolls back the event; policy journal failure
also rolls back policy head/revision. Exact retries recover the original result even
if a newer quote/policy/event exists, subject to current authorization. Changed
content409 and another actor403 cannot hijack an acknowledgment. Failed recovery
never proves an earlier uncertain write failed; modal clients retain the original
command in memory for exact retry and guard closure/navigation/unload. This is not
a durable offline queue or persistence across account loss/browser termination.

## Schema and operations

Additive quote migration v3 creates policy head/revision/request and review event/
request tables, FKs to immutable quote/policy revisions, append-only triggers and
indexed quote/version event ordering. Applied v1/v2 SQL is unchanged. Assessment
`reviewEvaluationVersion` must be bumped when approval-relevant rule semantics
change; older manual events then require current-rule reevaluation.

`summaryInTransaction` is a synchronous narrow internal contract: the caller owns
the service transaction. Future offering must recheck it atomically with its write;
never trust cached UI qualification or nest transactions/hold locks across awaits.
Back up before upgrading; recover from a matching app/database backup, not edited
migration history. PostgreSQL/multi-replica/LXC qualification remains separate.

## UI and remaining work

Settings contains versioned policy controls/history. The saved quote workbench
contains bid financial comparison, flags, qualification, approve/revoke dialogs and
event history. Inputs are shared primitives; first policy values are blank until an
admin explicitly enters them. Modal commands preserve exact uncertain writes.

API/unit/upgrade proof does not establish actual pointer/keyboard, nested-modal,
checkbox, reload, narrow-device or screen-reader behavior. Those checks remain
pending while browser access is unavailable. Historical reviewer-name presentation,
overhead/burden/allowance/alternate models, issuer documents, PDF, offering, explicit
customer delivery/acceptance and job/procurement handoff remain open.

## Supplier-pending drafts

See [pending material pricing](sales-pending-pricing.md) for nullable internal draft
prices, unlisted working items, partial subtotals and hard approval/export gates.

## Offering boundary

[Quote lifecycle commands](sales-quote-lifecycle.md) now recheck current qualification
in the offer transaction and retain its policy/evaluation/event evidence. Issued
offers retain that review snapshot; later policy changes do not rewrite them.
