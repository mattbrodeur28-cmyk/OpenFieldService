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
