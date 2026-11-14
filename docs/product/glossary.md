# Domain glossary

| Term | Meaning and boundary |
| --- | --- |
| Company / workspace | The single operating business in this deployment; teams do not create isolated tenants. |
| User | A local login identity with role, active state and optional member HR capability. |
| Technician | A service resource record; currently separate from a user account. |
| Customer | A residential or business party receiving service and invoices. |
| Contact | A person associated with a customer/site; a richer multi-contact CRM model is planned. |
| Site / building | A customer's physical service location, with access, timezone and safety details. |
| Equipment / asset | A serialized maintained item at a site with lifecycle and retained service history. |
| Controller / point | Planned controls-specific equipment hierarchy and point/checkout records; not live telemetry today. |
| Job / work order | A service record describing work, customer, optional equipment, status, checklist, notes and materials. |
| Appointment | A scheduled resource/time allocation; currently stored on the job. Separate appointments are planned for Dispatcher. |
| Service type | Catalog defaults for work description, duration, price and color. |
| Contract / maintenance agreement | Planned commercial obligations, coverage, recurring visits and renewals; not the job recurrence flag alone. |
| Membership | Planned residential agreement with benefits, billing/renewal consent and visit entitlements. |
| Project / phase | Planned multi-job commercial/construction budget and execution hierarchy. |
| Invoice | Current itemized receivable with status and recorded amounts; not a full accounting ledger. |
| Payment | Planned payment transaction/reconciliation record. Marking an invoice paid does not process money. |
| Team channel | Persistent internal conversation protected by membership; separate from AI Chat. |
| AI Chat | Private provider-assisted conversation; external context must be selected deliberately. |
| Builder proposal | A saved frontend draft with source hashes and review/export; generation is not deployment. |
| Integration connection | Per-user OAuth credential and supported provider reads; a catalog card alone is not a connector. |
