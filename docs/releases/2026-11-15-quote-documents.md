# Quote document review and draft HTML export

Saved quote revisions now have an authenticated customer-field document projection,
a workbench review dialog, and self-contained HTML draft download. Prices and terms
come from the selected immutable saved revision. Current native customer, location
and equipment details are read in one service transaction, customer-scoped and
clearly identified as current rather than a frozen offered identity. Prospects and
unlinked locations remain explicit. No native business record is copied or changed.

A positive field allowlist omits all internal cost, margin, inventory evidence,
profile review and private CRM/site/equipment notes. The HTML renderer escapes every
business text field and includes no script or remote dependency. Download responses
use private/no-store, nosniff, attachment disposition and restrictive CSP headers.
The normal Sales session/current-ownership boundary applies; these are not public
customer links. Viewing or downloading records no delivery, acceptance or payment.

The UI exposes review only for a saved revision while there are no unsaved edits or
pending operations. History can preview an earlier saved version. Customer details
may change between reviewing and downloading because they are current projections;
that distinction is present in both copies and is not an offering guarantee.

## Evidence and limits

Contract tests cover exact inclusive/exclusive tax, immutable selected prices/terms,
current native identities, future-field redaction, private note exclusion, hostile
HTML text, scoped native relationships, current owner/session/revision errors, safe
attachment headers, and unchanged business counts/status. TypeScript and production
build checks accompany the increment; the existing main-chunk size warning remains.
All 151 regression tests pass, including 12 quote contract tests; TypeScript is
clean and the production build succeeds. These checks do not close browser gates.

The preview and download have not been qualified with real browser interaction.
The last browser inventory reported its access host unavailable; earlier Quotes
workbench testing also stopped at an automatic approval usage limit. Build/API proof
is not dialog, download, print/page-break, narrow-device or screen-reader proof.
No live LXC/customer/provider qualification is claimed.

SALES-005/006/013 remain open. Reusable business/issuer templates, alternates,
margin/discount approvals, immutable offered identities, PDF generation, explicit
customer delivery/acceptance and quote-to-job/procurement conversion remain required.
