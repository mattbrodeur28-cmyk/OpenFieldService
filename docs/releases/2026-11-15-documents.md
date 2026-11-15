# Tagged ticket, PO and delivery documents

Private PDF/PNG/JPEG/WebP upload, tags/filtering, original download, attributed metadata
correction, reversible archive/restore and importing an existing PO document onto a
ticket are implemented. Uploading on a delivery links the same file to its PO. Native
FKs and a shared component keep one document identity across apps. Lists and import
sources are paginated. Current permissions are Owner/Admin management and mapped
assigned-technician job read/upload; HR has no extra power. Current access is checked
on download and after multipart reads. Approved service evidence remains unchanged.

Bytes/identity/checksum, links, audit and request acknowledgements are immutable;
updates use version guards. Atomic transactions prevent files without links or replay
records. Stored bounded10MiB/file in private service SQLite, with internal byte dedup.
Downloads verify hash and force attachment with detected extension/no-store/nosniff/
sandbox. This is basic type validation, not malware scanning; UI states Not scanned.
S3/local-object adapters, scanning/quarantine, purge/retention, OCR/email imports and
multi-replica storage remain open. No public/static upload path or provider dependency.

Real local Chrome: used native file chooser to upload689byte disposable packing-slip
PDF to actual fixture PO delivery02 with packing slip/receipt/job cost tags. Observed
saved row and original-file download Done689B. On equipment-linked ticket imported
the existing PO file, then observed the same document UUID and tags without reupload.
Ticket's historical material cost still$12.50 after later PO receipts. Edited shared
tags from the delivery dialog and verified the underlying PO document list refreshed
automatically on close. No production file, supplier, customer communication, LXC or
provider mutation. Archive/restore, role revocation and rollback are automated tests;
broader physical/mobile UX pending.

Additive `_documents_migrations`v1; Purchasingv1 and Inventoryv1/v2 SQL unchanged.
Online SQLite backup/restore fixture recovered identical bytes, job/PO/receipt links,
PO accepted quantity and stock, with foreign-key/integrity checks. Back up both
service/workspace files and private configuration; restore matching app/database.
Large-library restore performance and production proxy upload limits remain untested.

Validation:110 tests pass, TypeScript/production build/whitespace checks pass.
JS497.61kB(145.83gzip),CSS82.97kB(14.87gzip). Includes exact tag filtering/pagination,
byte dedup, immutable history, stale/version/replay conflicts, MIME spoof rejection,
size limits, cross-technician denial, async role changes and full upload rollback.
