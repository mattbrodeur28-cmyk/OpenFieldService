# Debian 13 / Proxmox LXC

Standalone hosting is the first fork milestone. Commercial and controls extensions
and the two QuickBooks connectors are planned separately; they are not implemented
by this deployment change. QuickBooks is not required to run the app.

## Container

Use the Debian 13 amd64 standard template in an unprivileged LXC. A reasonable
initial allocation for a small pilot is 2 vCPU, 2 GB RAM and 16 GB disk. Allow more
space when drawings and program backup attachments are added. Use a reserved IP
and include this container in your PVE backup jobs. This deployment uses no Docker,
privileged container, nesting or controller/network discovery features.

The commands below run **inside the LXC**, as root. Nothing here creates or changes
the PVE host. Debian/systemd operation still needs acceptance on the actual LXC;
development tests on macOS are not evidence of a successful Debian deployment.

## Install prerequisites

Install Git, curl and CA certificates:

```sh
apt update
apt install -y git curl ca-certificates xz-utils
```

Install **Node.js 24** system-wide (`/usr/bin/node` or `/usr/local/bin/node`),
using your approved package source or the official [Node.js downloads](https://nodejs.org/en/download).
The app uses Node's built-in SQLite module; an older distribution Node package
may not supply the required runtime. Do not use a root-home nvm installation for
the systemd service. Check Node, then install the pinned package manager:

```sh
node --version
node -e 'if (Number(process.versions.node.split(".")[0]) !== 24) throw Error("Install Node 24 first")'
npm install --global pnpm@11.20.0
pnpm --version
```

## Install this fork

Use the standalone branch once it has been pushed to the fork. Alternatively copy
the reviewed checkout to `/opt/openfieldservice`; the original upstream main branch
does not include these deployment files. Do not install over an existing directory.

```sh
git clone --branch feature/debian-standalone https://github.com/mattbrodeur28-cmyk/OpenFieldService.git /opt/openfieldservice
cd /opt/openfieldservice
pnpm install --frozen-lockfile
pnpm build
pnpm exec tsc --noEmit
pnpm test
```

Register a dedicated non-login service account and the unit:

```sh
getent passwd openfieldservice || useradd --system --user-group --home-dir /var/lib/openfieldservice --no-create-home --shell /usr/sbin/nologin openfieldservice
install -m 644 deploy/openfieldservice.service /etc/systemd/system/openfieldservice.service
systemd-analyze verify /etc/systemd/system/openfieldservice.service
systemctl daemon-reload
systemctl enable --now openfieldservice
systemctl status openfieldservice --no-pager
curl --fail http://127.0.0.1:3000/healthz
curl --fail http://127.0.0.1:3000/api/stats
```

The first start initializes a new UUID schema. The service account owns the state
directory created by systemd, while the application checkout remains root-owned.
The database is `/var/lib/openfieldservice/openfieldservice.sqlite`, outside the
checkout. Existing Wrangler/D1 data is **not** automatically copied. Legacy
integer-ID databases are refused, not reset. Migration from a populated deployment
must be planned and backed up separately.

## Access

The default listener is `127.0.0.1:3000`. For an initial browser check, forward the
port from your computer:

```sh
ssh -L 3000:127.0.0.1:3000 root@LXC_IP
```

Open `http://localhost:3000`. The inherited app has no standalone user login or
roles. For shared access, place it behind an authenticated HTTPS reverse proxy.
Do not forward an unauthenticated listener to the public Internet. HTTPS also
allows browser service workers/offline access on a remote hostname.

To deliberately enable a private LAN listener, create `/etc/openfieldservice.env`
with `HOST=0.0.0.0`, restrict access with your network/firewall, and restart the
service. `PORT` can also be overridden there. Keep `DATABASE_PATH` at the default
location: the unit's filesystem protections permit writes to its state directory.

## Backups and restore

Use SQLite's online backup API rather than copying a live WAL database file:

```sh
cd /opt/openfieldservice
install -d -m 700 /var/backups/openfieldservice
DATABASE_PATH=/var/lib/openfieldservice/openfieldservice.sqlite pnpm db:backup "/var/backups/openfieldservice/$(date -u +%Y%m%dT%H%M%SZ).sqlite"
```

An existing destination is refused. Backups contain customer data; restrict access
and copy them off the container. This command is manual; no backup schedule is
installed. PVE backups supplement these application backups.

To restore, stop the service, retain the current database **and** its `-wal`/`-shm`
files together in a separate recovery directory, then copy the chosen backup into
the original database path. Set ownership to `openfieldservice:openfieldservice`
and mode `600`. Do not leave old WAL sidecars next to the restored file. Start the
service and verify customers, equipment and jobs in the browser.

## Updates

Back up first. Stop `openfieldservice`, review and fast-forward to the intended
commit in the checkout, then run `pnpm install --frozen-lockfile`, `pnpm build`,
`pnpm exec tsc --noEmit` and `pnpm test`. Start the service and read back
`/healthz` and `/api/stats`. Finally open a saved equipment/job bookmark and
confirm records survived. Do not delete or reset the state directory for updates.

Logs: `journalctl -u openfieldservice -n 100 --no-pager`.

## Manual development / configuration

`pnpm build && pnpm start` serves the frontend and API together on port 3000.
Defaults: `HOST=127.0.0.1`, `PORT=3000`, database `data/openfieldservice.sqlite`.
`DATABASE_PATH` overrides the database filename. `/healthz` checks the SQLite
connection. SIGTERM/SIGINT drain HTTP connections and close SQLite.

`pnpm dev`, `pnpm db:setup` and `pnpm db:migrate-uuids` remain the original
Wrangler/D1 workflow and affect a different database. They are not needed for a
fresh standalone install. Build the frontend before running tests: the standalone
integration tests exercise the actual production assets as well as the API.
