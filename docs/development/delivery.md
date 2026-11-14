# Development and delivery standard

## Local standalone workflow

Use Node 24 and the package manager pinned in package.json. From a clean checkout:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm exec tsc --noEmit
pnpm test
```

For a disposable local instance, set `DATABASE_PATH` outside the checkout,
`HOST=127.0.0.1`, a private bootstrap key and an unused `PORT`, then run `pnpm start`.
Never point tests or preview instances at production databases. Wrangler/D1 development
is a separate runtime; see README. Build before the tests that serve production assets.

## Required delivery record

Copy this outline into a feature issue or `docs/releases/` entry. Small changes may
combine fields, but must record acceptance evidence and limitations.

- Feature ID, concrete problem and resulting behavior.
- Users/roles and authorized workflow, including permission denials.
- Business rules/invariants and module owning each rule.
- Data model, API contracts, error/pending/empty states and concurrency behavior.
- Migration and preservation requirements; backup, upgrade and rollback steps.
- Verification: automated checks, browser actions, fixture/provider/live evidence.
- Operations: configuration, logs, limits, secret handling and recovery.
- Acceptance criteria met, deferred criteria, commit and deployment state.

Keep stable feature IDs. Check a roadmap item only when its documented criteria
are met; distinguish implementation from live deployment and provider qualification.
Future subfeatures stay planned even when the parent screen exists.

## Verification scope

Run relevant domain tests, typecheck and build for changes to production code. Use
real browser checks for focus, keyboard, portal, responsive or interaction changes.
Do not add tests that merely repeat CSS/classes. Account/permission/concurrency and
migration changes need behavioral tests. CI runs the frozen install, build, typecheck
and test suite in Node 24 on Debian trixie; a local pass is not a hosted CI result.

Before publication inspect the diff for secrets, accidental generated files and
unrelated changes. Record the immutable commit after publication. After deployment
read back health, login and representative populated records; record the deployed
commit separately. Never claim fixture tests prove real OAuth, AI or LXC operation.
