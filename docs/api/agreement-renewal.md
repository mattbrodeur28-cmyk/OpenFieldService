# Agreement renewals

M5 CONTRACT-006 increment, 2026-11-26. A renewal creates a new draft from an authorized
source agreement, so repricing and a new term flow through the normal review/offer/
acceptance/authorization lifecycle rather than silently overwriting the old agreement.

`POST /api/agreements/:id/renewal` (Owner/Admin) takes
`{id,requestKey,renewalDraftId,expectedVersion,startsOn,endsOn,priceCents,reason,
reviewAttested:true}`. The source must be an authorized agreement at the exact
`expectedVersion`; the command copies the source customer/title/scope/terms into a new
draft with the new dates and price, and records an immutable `_agreement_renewals` row
linking source → renewal draft. `GET /api/agreements/:id/renewals` returns that history.

The renewal draft is a normal draft: it must be reviewed, offered, accepted and
authorized like any other agreement. No renewal implies coverage, generated work or
revenue, and there is no automatic renewal. Assigned renewal tasks, reminders and
notification delivery remain separate work.
