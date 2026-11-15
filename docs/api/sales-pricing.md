# Sales pricing and company billing profiles

Standalone service-DB module, mounted under `/api/sales`. Sessions and
`X-Requested-With: OpenFieldService` verification use the same Sales boundary;
current user is checked after body reads. JSON is bounded to 50KB, including streamed
bodies. This is pricing foundation, not a persisted quote or customer acceptance.

## Billing profiles

`GET /billing-profiles?page=1`: active Owner/Admin/Member, 50 profiles/page with
`profiles`, `page`, `hasMore`. Viewer has no pricing-rule access. HR adds no power.
Each row: `id`, `version`, `config`, `updatedAt`, `requiresReview`.

`POST /billing-profiles`: Owner/Admin only, strict body `{id, requestKey,
expectedVersion, config}`. IDs/keys are UUIDs; create expectedVersion=0, edits use
current version. Returns `{profile}`. Commands are actor-bound and idempotent;
identical retry acknowledges the original saved version, altered retry409, different
actor403. Stale edits409. Head, attributed immutable revision and immutable replay
acknowledgement commit atomically. Failed acknowledgement rolls everything back.

Config schemaVersion=4: name, uppercase two-letter state, jurisdiction, segment
(residential/commercial), effectiveFrom real ISO date, effectiveTo date/null, active,
reviewNote (10–2000 characters), and exactly one reviewed rule for each category:
`labor`, `material`. Each rule has kind, treatment
(exclusive/inclusive/exempt/outside_scope), rateBasisPoints0–10000 and note10–500.
Exempt/outside_scope requires zero rate. Profiles are explicitly selected; no legal
rates, state-wide taxability, automatic address lookup or compound tax engine supplied.

Requested company policy: technician, apprentice and after-hours lines share Labor.
Service, permits, licensing, subcontractors, fuel and travel distance always have zero tax and no tax control.
Other fees have been removed. Pricing lines for those non-taxable costs remain.
Earlier local pilot profiles with split labor or extra tax controls are exposed as
reviewable drafts with requiresReview=true and blocked from preview until an admin
saves a new version. Earlier stored review evidence is not rewritten. A schemaVersion
is a payload shape, separate from the database migration ledger.

## Exact estimate preview

`POST /estimates/preview`: opportunity owner Member or Owner/Admin, active open
opportunity only. Body: opportunityId, expectedOpportunityVersion, profileId,
expectedProfileVersion, pricingDate and 1–100 distinct lines. Requires current
opportunity/profile versions, matching segment, active profile and effective date.
Earlier profile shapes require explicit review first.

Line: UUID id; kind (technician/apprentice/material/service/permit/license/distance/
fuel/after_hours/subcontractor), description1–500, quantityMilli1–1e9, headcount1–100
(labor only, otherwise1), unitCostCents/unitSellCents0–1e9,
discountBasisPoints0–10000, materialId UUID/null, costOverrideReason0–1000,
travelGroup0–80 and includesFuel boolean. Material alone requires a native material
ID. Distance/fuel require a travel group; other categories must not use one. Only
distance can include fuel, and a second fuel line in that group is rejected.
Labor burden is currently included explicitly in the reviewed cost rate; automatic
burden rules, allowances/alternates and labor multiplier conflict checks remain open.

Response includes calculationVersion1, currencyUSD, rounding identifier, chosen full
profile and version, opportunity/date/version, lines with costs/discounts/net/tax/total
and applied tax rule/category, totals, profit/margin/markup and native materialSnapshots.
`persisted:false`: no saved estimate/quote, job, stock movement, invoice or demand is
created. Internal cost/source/review notes must not be included in future customer
quote documents by default. Members can preview only their own opportunities.

Integer milli quantities and cents use BigInt products and half-up per-line cent
rounding: labor quantity × headcount; cost and gross selling independently; discount
against gross; exclusive tax added to discounted price; inclusive tax extracted from
that price. Exempt/outside-scope tax zero. Sum rounded lines; no floating accumulation.
Profit = net excluding tax − cost; margin uses net, markup uses cost, in basis points
truncated toward zero; zero denominator null. Calculation limit $100million.

Material pricing uses Inventory's narrow synchronous `quoteMaterialSnapshots` contract
inside the caller-owned service transaction. Snapshot: native ID/name/unit, company
stock quantity/value, rounded company weighted-average unit cost and source-version
fingerprint. Never use the legacy catalog cost as an unreviewed fallback. No company
stock yields null cost; null/different selected cost requires a10-character reviewed
override. Estimate input is not actual job expense; later purchases cannot rewrite
an earlier returned calculation. Saving immutable offered versions is subsequent work.

## Storage and qualification

Additive checked `_sales_billing_profile_migrations` v1; private service SQLite head,
review revisions and request journals. No applied SQL edits. Existing online backup
includes these records. Matching app/database restore applies; no Postgres/Kubernetes
or multi-replica qualification is claimed. Material pricing remains inventory-owned.

Automated tests cover exact/mixed rounding, tax policy, limits, duplicate travel fuel,
missing/stale profiles, native cost changes/overrides, role/body races, actor replay,
immutable revisions and full rollback. Local Chrome verified a disposable profile
creation, decimal7.25 reload, native pointer dropdown selection and revision2 save.
Final category/padding browser qualification is recorded in the release note.
