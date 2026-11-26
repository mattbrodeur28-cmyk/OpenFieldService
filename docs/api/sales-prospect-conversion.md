# Prospect to native customer conversion

2026-11-25, local source only. Testing is explicitly deferred. No new migration,
browser, production or provider qualification is claimed.

## Ownership and operation

CRM owns native customers, account classification, service locations and contacts.
Sales owns the retained prospect conversion and opportunity link. The single service
SQLite transaction creates/reuses CRM records, links the opportunity, increments
its version, appends CRM/Sales audit and journals its acknowledgment. Public contact
creation and conversion share one internal contact operation, including validation,
roles, site ownership and audit; there is no duplicated contact write rule.

A member can convert their own open opportunity; Owner/Admin can convert any open
opportunity. HR gains no additional permission. Existing Sales company-wide record
read visibility remains a known limitation. The conversion options/summary require
write ownership because they expose the conversion review. Session/role and CSRF
checks run again after awaited JSON parsing; body limit50KB, private/no-store.

The opportunity keeps its stage and estimate; it does not become Won, create a Job,
accept a quote, activate a contract, issue an invoice or send a customer message.
Quote-to-Job conversion is its own explicitly accepted workflow. A prospect already
linked to native Customer/Site/Equipment, closed work, or one with any frozen quote
offer is rejected. Use the retained offer's reviewed mapping instead of changing
frozen identity through this shortcut. Saving a draft quote is not a frozen offer.

## API

Base `/api/sales`:

- `GET /opportunities/:id/prospect-conversion` returns nullable retained summary
  with conversion/customer/primary-location IDs, actor, reason, recorded time,
  createdCustomer and retained new site/contact ID lists. Authorized opportunity
  editors show this review and a reverse link to the native customer/locations.
- `GET /opportunities/:id/prospect-conversion/options?search=&page=1&customerId=`
  returns25 searchable native customers/page, selectedCustomer (including when not
  on the current page), hasMore, and the selected customer's first100 locations.
  `sitesTruncated` explicitly identifies that bound. Search is literal, max200,
  across name/email/phone. No account copy is made for these lookups.
- `POST /opportunities/:id/prospect-conversion` accepts the strict command below.

Common command: `{id,requestKey,expectedVersion,target,sites,contacts,primarySiteId,
reason,reviewAttested:true}`. IDs/key UUID, expectedVersion nonnegative integer,
reason10–2000 chars. Primary site UUID/null. Up to10 new locations and10 contacts.

`target` is either:

- `{mode:"existing",customerId}`: reuse native account identity. Do not overwrite
  its name, address, communication details or classification. If an explicit account
  classification exists and is not Customer, review it separately first.
- `{mode:"new",account:{id,name,email,phone,address,city,state,zip,notes}}`: create
  native Customer and Customer classification using the saved opportunity segment.
  Name1–200, email empty/valid≤254, phone≤60, address≤500, city/state≤100, zip≤30,
  notes≤2000. Optional text defaults empty.

Each new site `{id,name,address}` requires name1–200/address1–1000. Its timezone
comes from Company Settings at conversion. Reusing existing sites requires only a
primarySiteId belonging to the chosen Customer. Existing sites are not cloned.
The primary may instead name a newly created site. Equipment is added later under
its real customer/location; conversion invents no asset or report eligibility.

Contact input is the existing CRM contact contract plus UUID `id`, without
expectedVersion. Contact roles/preferences and reachability validation are the same
as public contact creation. Optional siteId must belong to the selected/new account.
UI currently offers one deliberate account contact; API supports10. UI marks reviewed
email/phone usable, SMS off; it sends no communication or marketing consent claim.

## Duplicate and retry rules

New customer with an exact SQLite case-insensitive trimmed name or nonempty account
email match is rejected409, requiring existing-account review/reuse. This is a
conservative first policy, not fuzzy matching, international normalization or merge.
New sites reject matching names within their account. New contacts reject duplicate
account email or matching name+phone; omit an existing contact from the new-contact
list. Reused customers retain their original contacts. Identity collisions reject.
All validation occurs inside the write transaction; a later contact failure rolls
back a newly created account/sites, opportunity link, audit and acknowledgment.

Only one retained conversion per opportunity. Original native UUIDs are foreign
keys; actor/reason/mapping are immutable. Same request key/actor/validated body returns
its original acknowledgment after current permission checks, even after version
advance. Another actor403, changed content409. A different key against an already
converted prospect rejects409. UI freezes an uncertain command in memory and retries
its exact body; there is no durable offline mutation queue. Source-version conflict
requires reload/review, not silent conversion against newer prospect fields.

## Persistence and remaining work

New `_sales_prospect_migrations` v1 adds only immutable conversion/request tables;
applied Sales and CRM migration strings remain unchanged. No populated records are
rewritten. Deploy after consistent service/workspace backups and qualification; use
matched code/database restore, never delete the migration ledger to force startup.

The opportunity editor disables conversion while it contains unsaved edits. The
review defaults to existing-account search, supports multiple named service locations
and optional contact creation, then refreshes Sales and closes the old editor after
success. Creating arbitrary account relationships, fuzzy dedupe/merge, bulk import,
per-record visibility, signed customer consent, full CRM activity/agreements and
cross-replica PostgreSQL transactions remain distinct M4/M2 requirements.

Deferred tests must cover two-site/contact conversion, existing-account preservation,
ownership/temporary-password revocation, duplicate checks and concurrent conversion,
exact retries, actor binding, stale versions, late failure rollback, frozen offers,
contact role validation, location ownership, company timezone and populated migration
preservation. Browser coverage must include search paging, unsaved edits, field focus,
keyboard/modal recovery and uncertain retries. No checks were run for this increment.

Automated follow-up: native prospect and accepted-quote handoff tests now pass in
the228/228 suite, and TypeScript passes. See [exact coverage and remaining gates](../releases/2026-11-25-automated-progress.md).
Earlier testing-deferred notes describe the original source checkpoint; browser,
concurrency, populated upgrade and production/provider qualification remain separate.
