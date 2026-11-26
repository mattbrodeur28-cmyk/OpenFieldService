# Native module and object contracts

M2 ARCH-001/014/015 source increment, 2026-11-25. Testing is deferred by the owner.
This API is local source awaiting qualification and backend reload; metadata does
not prove a business feature works or a deployment/provider is healthy.

## Purpose and boundaries

`platform/module-registry.mjs` validates version1 native manifests;
`platform/native-modules.mjs` declares the current ownership catalog. Source-owned
UUIDs and object keys survive display-label changes. Core records keep their existing
UUIDs and tables. Registering a descriptor does not copy a Customer, change a schema,
install/enable a module or register a generic record mutation route.

Modules currently describe Identity, CRM, Equipment, Service, Dispatch, Inventory,
Sales, Finance, Purchasing, Fleet and HR source. Agreements/Projects are explicitly
planned with no invented objects. Source availability is a code descriptor, not
qualification of every module feature. The registry declares identity/object labels
and selected native relations, not a complete field schema, OpenAPI replacement,
generated API or full Twenty-compatible metadata engine.

## Registration validation

- Strict bounded schemas for module/object/field/relation definitions, fixed UUIDs,
  namespaced keys, supported types, contractVersion1 and explicit storage profile.
- Unique module/object identities and keys; object namespace must match its owner.
- Protected native ID field, unique field/relation names and no name collision.
- Required module dependencies must exist, be unique and have no cycles.
- Every relation target must exist; cross-module references must declare that owner
  as a direct dependency. The registry derives inverse one-to-many descriptions
  from those many-to-one references; it does not maintain another relationship store.
- Returned catalog and descriptors are recursively frozen. Clients cannot mutate
  registration or inject SQL names/code. No database handle, SQL table name, secret,
  user record or business-row content is exposed by metadata.

Registration failure prevents Node startup. Metadata describes the declared native
model; it does not introspect/migrate a database or validate every business row.
A missing repository adapter is not made available by this read-only catalog.

## API and access

Under `/api/platform`, mounted after the existing authenticated session guard:

| Method/path | Response |
| --- | --- |
| GET `/modules` | contractVersion, capability flags and module descriptors/dependencies/objectKeys |
| GET `/objects?page=1&search=` |25 object descriptors/page, total/page/pageSize; literal key/label search≤100 chars |
| GET `/objects/:key` | One registered object descriptor;404 if unknown |

Active Owner/Admin only. Missing session401, forced-password-change403, other roles
403 (HR has no platform administration elevation). Responses private/no-store.
Unknown query keys and invalid page/search return400. Metadata reads do not expand
access to the owning module's records. Record APIs continue enforcing their existing
service policies; current company-wide Sales read visibility is not fixed here.

Each object describes native identity, owner module, storageProfile (service or
workspace), record/ledger/snapshot/projection kind, domain-command/read-only mutation
boundary, selected fields/relations and derived inverseRelations. `systemManaged`
means metadata cannot edit that field. Even a domain_commands object has no generic
CRUD write through this API. Ledger/snapshot rows remain governed by their existing
append/reversal/version commands, rather than direct record edits.

The native registry capability flags are `metadataRead:true`, `metadataWrite:false`,
`generatedCrud:false`, `runtimeInstall:false`, `customObjects:false`. These are
current capabilities, not disabled UI switches that secretly provide those backends.

## Next platform slices and qualification

ARCH-016 owns reviewed custom fields/relations and value persistence/migrations.
ARCH-017 owns shared object/record/field authorization; this catalog is admin-only
until that policy layer is qualified. ARCH-018 owns saved views/layouts. ARCH-019/020
own workflow definitions/outbox/workers, ARCH-021 app packaging and API contracts.
All retain the shared ownership direction in ADR-0007 and native business invariants.

Before release, cover duplicate IDs/names, missing/cyclic dependencies, namespace and
field collisions, invalid relation targets, stable identities, deep immutability,
inverse navigation, request validation, role/session revocation and absence of record
or secret leakage. Verify metadata matches actual adapter schemas and add migration/
contract coverage as field definitions grow. No tests or runtime requests were run
for this source increment; PostgreSQL/multiple replicas remain unqualified.

## Typed custom-field backend follow-through

Unqualified source now adds separate customFieldRead/customFieldWrite capabilities
on four explicitly listed native object keys. [Custom-field API](custom-fields.md)
describes typed optional annotations, real native references, definition revisions
and immutable value history. Native schema registration stays read-only; custom
objects/generated CRUD and granular ordinary-user field access remain open. No UI
or qualification is implied by these additional backend routes.
