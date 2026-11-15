# ADR-0006 — Private native document records and initial storage adapter

Status: accepted for the single-instance standalone pilot,2026-11-15. S3/local object
adapter and full scanning/retention qualification remain ARCH-010/DOC-005.

## Context and decision

Jobs, purchasing and deliveries need the same tagged packing slip/receipt without
copied files or customer/job/material masters. Documents own immutable original bytes,
private identity/checksum and current title/tags, with explicit job/PO/receipt foreign
keys. A separate authenticated `/api/documents` API owns the upload size boundary;
service JSON stays50KB. App modules embed the shared client component.

For this pilot the storage implementation is private SQLite BLOBs, bounded10MiB/file.
This keeps file bytes, metadata, links, audit and replay acknowledgement in one atomic
transaction and includes files in the existing online backup. No public static paths,
filesystem name traversal, missing-object commit window or orphan cleanup job is
introduced. Deduplicate identical bytes internally by SHA256; never expose a global
file/hash lookup. Modules reference document UUIDs, not storage paths or blob IDs.

## Consequences and alternatives

This is a small single-instance adapter, not the finished enterprise storage boundary.
SQLite size and backup bandwidth grow with uploads; synchronous bounded reads/writes
occupy the single Node process. A private filesystem/object adapter separates metadata
from bytes and needs staged object lifecycle, integrity, cleanup/retention and recovery
rules. S3-compatible shared storage is the intended later deployment option; do not
add multiple writable replicas over this local SQLite database.

A later adapter migration must preserve document UUIDs, hashes, link/audit history and
private access. Introduce a tested blob repository contract and staged verified copy
before switching pointers; recover/reconcile interrupted copies and restore consistent
metadata/object snapshots. A signed external object URL must be short-lived and issued
only after the same current record authorization. This pilot deliberately offers only
same-origin authenticated downloads; signed URLs are not claimed implemented.

Basic byte signatures/type checks and attachment-only downloads do not equal malware
scanning. UI/API states not_scanned. Quarantine/scanning, retention/purge and compliance
policy need qualification before treating file handling as enterprise complete. No
uploaded text is executed or supplied to an assistant automatically. Supplemental
ticket files cannot silently become part of an already-approved service report.

## Migration, rollback and evidence

Checked additive `_documents_migrations`v1 after Purchasing schema, with immutable
blobs/identity/links/audit/replay. Never edit applied SQL. Existing PO/inventory
migrations unchanged. Back up both SQLite databases/private configuration and restore
matched application/database versions. Automated online-backup/restore proves original
bytes, native links, PO receipt and stock together on disposable data; real deployment,
large-library backup performance and external object restore remain unqualified.

Revisit when document volume affects latency/backups, scanning/quarantine becomes a
requirement, document types expand, retention policies are approved, or PostgreSQL/
Kubernetes work begins. See [API](../../api/documents.md) and [release](../../releases/2026-11-15-documents.md).
