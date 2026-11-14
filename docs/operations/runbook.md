# Operations and recovery

Start with [deployment](../../deploy/README.md) and [account recovery](../../deploy/ACCOUNTS.md).
Current target is a single Debian 13 LXC / systemd Node 24 instance.

## Diagnose before changing

```sh
systemctl status openfieldservice --no-pager
journalctl -u openfieldservice -n 100 --no-pager
df -h / /var/lib/openfieldservice
curl --fail http://127.0.0.1:3000/healthz
```

If localhost works but HTTPS fails, check reverse-proxy target, TLS and NetBird route.
If process startup fails, check Node version, built assets, state ownership and env
file without printing secrets. A 401 on a private API without login is expected.
A health 200 alone does not qualify workspace, provider or browser workflows.

## Upgrade and backup

Use the account guide's backup/update sequence for **both** service and workspace
DBs. Back up the private environment/encryption configuration separately with mode
600 and restricted access. Before an update record `git rev-parse HEAD`, the target
commit, clean checkout status and backup paths. Stop before migration, install with
the frozen lockfile, build, typecheck, run tests, then restart and verify login,
populated jobs/equipment, team messages and settings. Do not reset databases.

Workspace schema upgrades are additive today. HR adds `users.is_hr` with default 0;
Builder revision metadata is retained in proposals. There is no versioned migration
ledger yet. UUID conversion is explicit and needs separate preservation checks.

## Rollback / restore

For a code-only rollback, stop the service and restore the previous reviewed commit
and its frozen dependencies/build; check its compatibility with the current schema.
For a data rollback, keep the current two databases plus their WAL/SHM sidecars in a
restricted recovery directory first. Restore the selected matching backup pair with
the service stopped, remove stale sidecars from the restored paths by moving them
into that recovery directory, and restore service ownership/mode 600. Retain the
original encryption key. Restart and read back representative records and login.
Restoring backups loses writes after the backup; coordinate a maintenance window.
Never restore just service records when identity/workspace state also changed.

Record the deployed commit, restore point, commands performed and browser readback
in a release entry. Schedule off-container backups and periodically prove restoration
in a separate instance. A backup file existing is not proof of recovery.
