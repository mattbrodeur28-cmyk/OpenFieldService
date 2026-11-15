# Private tagged documents API

Base `/api/documents`, authenticated standalone Node route, separate from the50KB
service JSON middleware. Owner/Admin reads/manages all documents. Active mapped
technicians read/upload their assigned job documents; current mapping checked on
list and download, including after body reads. HR grants no extra access; Viewer is
not admitted to private documents in this pilot. PO/receipt access and metadata/link
management require Owner/Admin. Later job attachments supplement the ticket and do
not mutate approved report/equipment/time evidence.

GET `/records?jobId=UUID` or `orderId=UUID` or `receiptId=UUID`: exactly one target,
50 metadata records/page (`page=1`,hasMore), optional exact `tag`<=32characters,
`includeArchived=true` for admins. Metadata includes immutable file identity/name/
checksum/media/size/author/time, current title/tags/version/archived flag, current
visible links and scanStatus=not_scanned. Members do not receive inaccessible PO or
other-job link metadata. File byte deduplication is internal, not globally searchable.

POST `/upload`: multipart exactly one file and one JSON metadata field. File<=10MiB;
request limit10MiB+64KiB. Metadata `{requestKey,title,tags,target}`: UUID key,
title1..160,tags1..12 entries1..32characters(no control chars/commas),target with one
or more existing jobId/orderId/receiptId UUIDs. Tags normalize lower-case and dedupe.
Receipt automatically links its parent order; conflicting supplied order fails.
Supported byte signatures: PDF,PNG,JPEG,WebP. Supplied MIME/extension is not trusted.
Basic type identification is not full format validation or malware scanning.

All submitted targets must be authorized, and authorization is checked again after
multipart reading. Blob, document, native FK links, audit and idempotency record commit
atomically. Same actor/key/body/file/name acknowledges original document; altered data
conflicts. Identical bytes can share one internal SHA256-addressed blob. Original
bytes/name/checksum/author remain immutable. No public/static upload directory exists.
The UI retains ambiguous attempts; format/size/metadata rejection allows correction
with a fresh key. No automatic resubmission/offline queue exists.

GET `/records/:id/download`: requires access through at least one current linked
record, archived410. SHA256 integrity verified before returning bytes. Always
Content-Disposition:attachment, detected-type extension, private/no-store, nosniff,
sandbox CSP and same-origin resource policy. Original filename retained in metadata;
download name uses detected extension to avoid opening mislabeled HTML/executables.
No inline document rendering, automatic file execution, OCR or AI ingestion occurs.

POST `/edit`: `{requestKey,id,expectedVersion,title,tags,archived,reason}`; reason
10..1,000chars, Owner/Admin only. Version conflicts409. Archive is reversible, affects
all links and blocks downloading until restore; bytes/history retained. No purge API.

POST `/link`: `{requestKey,id,expectedVersion,target,reason}`; Owner/Admin only.
Import already uploaded PO/receipt document onto a ticket by adding actual native
FK links, retaining one document/file. Archived files must restore first. Duplicate
links are unique; actor-bound request replay is safe. A supporting document link does
not assert stock lot provenance or allocate material quantity/cost.

Current adapter stores bounded file bytes in private service SQLite with native
metadata/links, so online backup includes them atomically. Restore fixture verifies
bytes, native relationships and PO stock; both app databases and private configuration
still require backup. Local/S3 object adapters, scanning/quarantine, retention purge,
physical device/mobile qualification and multi-replica storage remain ARCH-010/DOC-005.
[Storage decision](../architecture/decisions/0006-private-documents.md),
[release proof](../releases/2026-11-15-documents.md).
