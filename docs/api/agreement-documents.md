# Proposed contract PDFs by exact agreement revision

M5 CONTRACT-001/002/007 increment, 2026-11-25. Proposed source retention, not customer
acceptance, verified signatures or active coverage. Browser/provider qualification
remains separate from the automated source/API checks below.

## Ownership and boundaries

One immutable PDF may be attached to each exact native agreement draft revision.
Agreement, Customer, Site and Equipment identities remain unchanged. Metadata belongs
to Agreements; physical original bytes use the shared immutable private blob store.
Deduplication never creates a ticket-document or personnel-document association or
grants access to another module's records. A separately uploaded identical document
is an explicit separate disclosure under that module's own rules.

Current active Owner/Admin may upload. Current Owner/Admin/Member/Viewer may read,
matching the existing global business-record model; this is not granular owner/team
visibility or customer portal access. HR capability alone grants no upload authority.
All requests authenticate again at access time; uploads recheck current actor/writer
after awaited multipart parsing and file reading. CSRF is mandatory for mutations.

The original PDF, title, filename, reason, actor, revision and hash cannot be edited
or deleted. Replacement requires saving a new reviewed draft revision, then uploading
its own PDF. No file is silently copied forward. Historical PDF references remain
readable through their revision/history. Blob size/signature identification is not
full PDF parsing, malware scanning, signature validation or legal review.

## Review context

Attach before internal review. Submitted/approved current revisions reject uploads;
withdraw review first. The source snapshot/hash includes immutable PDF metadata and
SHA-256 when a PDF exists. Existing pre-attachment contexts without any PDF keep their
previous hash shape. A withdrawn context changed by attachment requires resubmission.

Internal approval may still concern an internal draft without a PDF. It never implies
that an authoritative legal document exists. Later offer/customer acceptance gates
must require and bind the exact proposed PDF plus retained scope and authority; those
lifecycle gates remain separate work. Saving or downloading does not notify anyone,
generate Jobs, accept terms, post revenue or activate entitlements.

## API

Under `/api/agreements`:

- `GET /:id/proposed-document?version=N`: optional exact positive revision, default
  current head. Returns agreementId/version and document metadata or null. Missing
  PDF does not imply acceptance. Current detail also includes proposedDocument/null.
- `POST /:id/proposed-document/upload`: multipart exactly one file and JSON metadata
  `{id,requestKey,expectedVersion,title,reason,reviewAttested:true}`. UUID ID/key,
  current positive revision, title1–160, reason10–2000, nonempty PDF≤10MiB with a
  supported PDF signature. Streamed envelope limit10MiB+64KiB; other agreement
  JSON requests retain100KB. Sanitized filename is metadata, never a filesystem path.
- `GET /documents/:documentId/download`: original bytes, attachment-only, PDF MIME,
  exact content length, private/no-store, nosniff, sandbox CSP and same-origin CORP.

Metadata includes native agreementId/version, title/originalName, recorded actor/time,
reason, SHA-256, sizeBytes, mediaType and explicit scanStatus:not_scanned. There is
no replace, reassign, delete, arbitrary URL fetch, public share or embedded PDF API.

## Transactions and migration

Additive `_agreement_draft_migrations` v3 creates immutable revision/blob references.
Previously applied v1/v2 SQL stays unchanged. Production composition initializes the
shared document store before agreements. Upload checks draft/version/archive/review,
stores immutable association/bytes and journals acknowledgment in one native SQLite
transaction. Late failures roll back new metadata and previously absent bytes.

Same actor/key/content returns the original response after current authorization.
Fingerprint binds agreement, exact revision, bytes, filename and validated metadata;
different content409, another actor403. A new key cannot replace a retained revision
PDF. The UI retains the exact in-memory File/metadata command and locks uncertain
edits/navigation. No durable offline upload queue or automatic merge is supplied.
Back up both application databases and configuration consistently before updating.

## Automated evidence and remaining work

Six `tests/agreement-documents.test.mjs` cases pass, alongside existing agreement
review tests. They cover original bytes/hash and review snapshot, historical PDFs
and replacement under a new revision, privileged upload/read access, review withdrawal,
strict PDF signature, actor/content retry, late acknowledgment rollback, immutable
rows, deduplication, safe/private HTTP downloads, CSRF and a streamed upload losing
writer authority before completion. A valid actual multipart upload is read back byte
for byte. Build and TypeScript pass for the new UI. Browser modal/file-picker/history
controls, malware scanning, populated v2→v3 upgrade/restore, concurrent writers and
customer acceptance/signature/provider proofs remain open.
