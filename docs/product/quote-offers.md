# Reviewed quote offers and recorded customer responses

The self-hosted Sales quote workbench supports internal draft → reviewed offer →
recorded delivery → recorded acceptance/decline. A configured external provider is
not required for this workflow. The app does not send email or verify a signature
when staff records an event. Staff must retain the underlying external evidence.

## Prepare and issue

Owner/Admin configures **Settings → Quote issuer and business terms** with reviewed
legal business name, address, business email, optional phone, quote terms and an
internal review note. No issuer or terms are seeded. These legal quote details are
versioned separately from public Website branding and the company timezone.

Save complete pricing and obtain the current company pricing qualification. A
material line awaiting supplier pricing cannot be offered. The offer command checks
current quote/opportunity/issuer/policy/review versions, active billing rules and
the company calendar. If the opportunity or billing rules changed since pricing,
recalculate and save another draft first. A linked equipment item must belong to
the linked customer location. Prospects may receive an offer without creating a
duplicate Customer; eventual job conversion must resolve the necessary native links.

Choose **Offer reviewed revision**, review issuer/terms, enter the recipient name
and email, and record the review note. One transaction freezes the customer-field
JSON, exact escaped standalone HTML, SHA-256 hashes, issuer version, recipient,
current native customer/location/equipment details and original native IDs, and the
pricing qualification evidence. The quote becomes offered and draft editing locks.
An immutable snapshot is documentary evidence, not another editable business record.

Use **View frozen offer document** and **Download offer HTML** for the retained
artifact. Draft document review remains separately labeled and uses current native
identity. It is not the frozen offer. Downloading either artifact records no
external delivery or acceptance. Future rendering changes do not alter stored
offer HTML. Current ownership/admin permission still applies to historical reads.

## Retain delivery and responses

Record delivery only after it occurs. Choose the method and enter a reference to
the retained email, external archive, signed document or hand-delivery record.
Choose the event time (now, or an unambiguous Company Settings local date/time),
confirm the evidence attestation, and record a note. Nothing is fetched from the
reference or sent to a provider. Delivery evidence binds both exact document hashes.

Only Owner/Admin records acceptance/decline or withdraws an offer. A response needs
prior delivery evidence for that exact offer, respondent name/email, capacity,
external evidence reference, explicit attestation, event time and review note.
This is an attributed staff record of an external response, not a customer portal,
verified identity, verified electronic signature or legal-signature service. Do not
claim those capabilities from a staff-entered event. Acceptance does not yet create
a Job, invoice, payment, purchase order, stock movement or Won opportunity.

Accepted quotes are locked; changes require the later change-order workflow. An
unaccepted offered/declined/expired/withdrawn quote can become a **New draft
revision**. It copies the saved estimate and template provenance, supersedes the
old offer, and requires qualification of the new revision. Old document/evidence
remains immutable; the command neither reprices stock nor inherits a manual approval.
Review copied costs, billing rules and dates before offering again.

Validity runs through the end of the valid-until day in the company timezone.
Expired state is computed on reads without writing an event; Record expiry retains
an explicit event. Delivery/response recording is blocked after validity expires,
including an attempt to enter old evidence retrospectively. Extend validity through
a reviewed new revision. Withdrawal closes the internal record and sends no notice.

All commands retain actor-bound exact-request acknowledgments. Pending/uncertain
writes lock the modal and must be retried with the original command; client state is
in memory, not a durable offline queue. Pricing approval and issuer/policy saves
refresh offer readiness. Server transaction checks remain authoritative.

PDF generation, provider-backed delivery, public acceptance links/e-signatures,
verified evidence attachment ingestion and accepted-material procurement remain
separate milestones. [Native job conversion](quote-job-conversion.md) is implemented
in working source with qualification deferred; acceptance alone does not invoke it. Browser coverage and remaining qualification
are recorded in the release evidence; backend tests do not establish every UI path.
