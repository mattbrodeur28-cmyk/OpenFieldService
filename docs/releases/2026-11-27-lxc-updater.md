# One-command LXC updater — 2026-11-27

DEPLOY-001 increment: install `deploy/update.sh` once as
`/usr/local/sbin/ofs-update`, then run `ofs-update` as root for subsequent releases.
Installation, custom paths and recovery are documented in `deploy/README.md`.

The command checks runtime/package manager and checkout state, prevents overlapping
updates, fetches and pins `origin/main`, stops the service, retains complete state
and private env/unit backups, fast-forwards without resetting changes, installs
frozen dependencies, builds, typechecks and runs the full suite. Startup must pass
local JSON health/session checks before success is reported. The installed updater
is refreshed atomically after success. Failed updates leave the service stopped;
no automatic code/database rollback or backup deletion is attempted. `--check`
performs local preflight without fetching/stopping. Existing systemd configuration
is retained. NetBird/HTTPS configuration is outside this command.

## Evidence

An isolated tree containing only this updater, its guide and tests was built and
its full suite passed 317/317 with zero failures/skips/cancellations/TODOs on local
Node 26.7.0. The existing large-bundle warning remains. Shell syntax checks pass.
Six orchestration tests use disposable real Git repositories and state/config
files, with simulated systemd/package manager/network/lock outcomes. They cover
successful backup/fast-forward/restart, dry preflight, dirty/diverged checkout
rejection, wrong runtime/lock contention, test failures retaining recovery files,
and bad health JSON stopping the restarted service. Private fixture config is not
printed. No real service, production database or external provider is changed.

Actual Debian Node 24/systemd, real advisory-lock contention, populated restore,
network failures and custom installation environments remain operator qualification.
A successful local health check does not prove public HTTPS, login or provider
workflows; verify representative saved records after each deployment. This does
not close the entire deployment/scale milestone.


## LXC incident: non-root service denied source-file access

The user supplied Node 24/systemd startup logs showing EACCES opening
`src/server/sales/http.mjs` after the first update. The updater's global umask 077
made root-created Git/dependency/build files owner-only, while systemd runs the app
as `openfieldservice`. The fixture suite had simulated process startup but had not
asserted service-readable modes. Passing tests as root did not catch this gap.

The correction uses umask 022 for public runtime artifacts and explicitly protects
backup directories. Before checks/restart it repairs read/traverse modes on public
source, dependency and build trees plus root package/TypeScript config files. It
does not change state/env permissions, make code writable to the service, or chmod
the entire checkout. Executable dependencies retain executable modes. A failed
command substitution now produces one parent error report/cleanup, not duplicate
reports from inherited subshell traps. Failed updates still leave the service
stopped with retained backups.

Seven updater cases now include owner-only source/dependency/build fixtures,
assertions of restored public runtime access and unchanged 0600 database/env plus
0700 backup permissions, and a connection-refused failure with exactly one error
report. Full local suite passes 318/318; production build and shell syntax pass.
Existing bundle-size warning remains. These are local orchestration/source results;
actual LXC recovery/readback remains to be confirmed by the operator.

Because failed runs do not refresh the installed updater, pull the correction and
reinstall `deploy/update.sh` to `/usr/local/sbin/ofs-update` before retrying. Existing
stopped-service backups remain intact; do not restore or reset data for this file-
permission repair.
