# Standalone accounts, users and teams

The Node deployment now runs a complete local workspace with account login.
There are no Clawnify SDK packages, host bridge calls, or Clawnify service/account
requirements. The original upstream MIT attribution remains intact. Optional AI
inference can be local Ollama or a hosted API; the workspace backend and databases
remain on your infrastructure.

## Update an existing LXC

Run as root inside the Debian LXC. Backups include both existing databases. The
app checkout must be clean; if App builder produced local changes, review and
commit them on a separate branch before choosing how to reconcile an upgrade.
Do not reset or delete a populated database to update.

```sh
cd /opt/openfieldservice
install -d -m 700 /var/backups/openfieldservice
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
for DB in openfieldservice workspace; do
  if [ -f "/var/lib/openfieldservice/$DB.sqlite" ]; then
    DATABASE_PATH="/var/lib/openfieldservice/$DB.sqlite" pnpm db:backup "/var/backups/openfieldservice/$DB-$STAMP.sqlite"
  fi
done
systemctl stop openfieldservice
git pull --ff-only origin feature/debian-standalone
pnpm install --frozen-lockfile
pnpm build
pnpm exec tsc --noEmit
systemctl start openfieldservice
curl --fail --retry 10 --retry-connrefused --retry-delay 1 http://127.0.0.1:3000/healthz
```

If the checkout belongs to `openfieldservice-deploy`, run Git, dependency install,
build, and typecheck as that user (e.g. `runuser -u openfieldservice-deploy -- git -C
/opt/openfieldservice pull --ff-only origin feature/debian-standalone`). Use root
for the database backup and service management. Do not bypass Git's ownership
checks globally.

The database changes are additive. Existing business records and knowledge remain.
Legacy shared-key conversations become accessible to the first workspace owner;
new AI conversations are private to their creator. Legacy proposals remain visible
to administrators. Chat/provider status APIs now require a user session; a bearer
WORKSPACE_TOKEN no longer grants normal API access.

## Create the first owner

Refresh the app. The initial owner screen requires the **existing WORKSPACE_TOKEN**
from `/etc/openfieldservice.env`, plus a name, email and new password of at least
12 characters. This prevents an unauthenticated visitor from claiming the server.
The first owner is added to the initial Field Service team. Once an owner exists,
public signup is closed; administrators create subsequent users under Users.

If the key was never configured, generate one privately in the LXC and restart:

```sh
apt install -y openssl nano
printf '\nWORKSPACE_TOKEN=%s\n' "$(openssl rand -hex 32)" >> /etc/openfieldservice.env
chmod 600 /etc/openfieldservice.env
nano /etc/openfieldservice.env
systemctl restart openfieldservice
```

Keep one WORKSPACE_TOKEN entry. Copy its value into the owner setup form; never
paste it into Chat or support messages. Keep the environment file in a private
backup. Saved provider keys are encrypted using WORKSPACE_ENCRYPTION_KEY when set,
or WORKSPACE_TOKEN otherwise. Do not change/remove that encryption key after
saving provider secrets without an explicit re-encryption migration.

## HTTPS and sessions

Use a trusted HTTPS reverse proxy for shared/remote access. When the app is served
through an HTTPS hostname, set `PUBLIC_URL=https://your-actual-hostname` in the
server environment and restart; this marks session cookies Secure. Do not set an
HTTPS public URL while still accessing the app via its plain HTTP port. NetBird
mesh connectivity alone does not terminate HTTPS; its reverse proxy can.

Passwords use salted scrypt. Sessions use random tokens, stored as hashes in SQLite,
with HttpOnly/SameSite=Strict cookies and seven-day expiry. State-changing browser
requests require a custom verification header; the app does not enable cross-origin
credential access. Password changes and administrator resets revoke old sessions.
There are bounded login/setup attempts. This is one company workspace, not multiple
isolated customer tenants. All business APIs require a valid login; `/healthz`,
login/session/setup and an explicitly published company page are the public paths.
The original Wrangler development mode remains a local test/development workflow;
it does not host these Node/SQLite account services. Deploy using `pnpm start`.

## Roles

| Role | Capabilities |
| --- | --- |
| Owner | All workspace operations; create/manage administrators; protected from UI deactivation |
| Admin | Manage members/viewers, teams, Knowledge, AI connections, website and frontend proposals |
| Member | Read/write service records and Knowledge; own AI chats; assigned team conversations |
| Viewer | Read service records and Knowledge; own AI questions; read assigned team conversations |

Only the owner can grant administrator access. Administrators cannot alter the
owner, promote themselves, or modify another administrator. No user can deactivate
their own account through user management. Accounts are deactivated rather than
deleted so attribution/history remain. Technician records are separate from users.

Creating an account requires a temporary password. Share it privately; no invitation
email is sent. First login requires a password change before accessing data.
Administrators can reset a non-protected user's temporary password in Users.

## Teams and navigation

Home and Chat are at the top. Team lists actual teams you belong to (administrators
can see all teams). The Team heading opens team management. Each team has a roster
and a persistent team conversation. Team messages stay in the workspace database;
they are separate from AI Chat and are not sent to model providers. Team screens
refresh messages every five seconds. Teams are collaboration groups within the
company, not separate databases or service-record visibility boundaries.

Apps contains the service pages. Account contains Website, Knowledge, Integrations,
Environment variables, Calendar, Users, App builder and Settings according to role.
Calendar opens the field-service schedule. The company Website page is a small
public landing page at `/company`, available only after an administrator explicitly
publishes it; this is not a general-purpose web hosting platform.

## Integrations and environment variables

Administrators can configure Ollama, DeepSeek and OpenAI in the app. Provider API
keys are write-only in the UI and encrypted in the database. Nonsecret model names
and Ollama addresses are editable. These allowlisted settings override the matching
server environment values without a restart. Empty key inputs keep an existing key.
The server remains the place for process/service settings, bootstrap/encryption
keys, HTTPS configuration and other privileged variables; these are never exposed
as a general browser shell or arbitrary environment editor.

QuickBooks Online/Desktop synchronization is still a separate planned module.
The Integrations page is limited to Google services, Microsoft services, HubSpot
CRM, LinkedIn and the existing AI providers. OAuth, encrypted per-user credentials,
read previews and explicitly selected Chat context are implemented. Follow
[Integration setup](INTEGRATIONS.md) for HTTPS, provider app registrations, exact
permissions and supported read operations. Sending, editing, social posting and
automatic synchronization are not implemented. App builder
continues to prepare reviewed frontend edits for the existing validation/rebuild
command; it does not autonomously execute commands or rewrite backend/auth code.

## Logout and offline data

Sign-out revokes the session, clears locally cached field records and pauses field
caching. A new login also starts with caching paused, so another user's records are
not silently reused in the same browser. The user may enable offline access again.
Tabs are notified of account changes. A previously signed-in tab can display its
saved field data while offline; authorization for any new server request still
requires a valid session. Revoking server access does not remotely erase data from
a disconnected device. Keep saved-data devices under your control.

## Owner password recovery

If the owner cannot sign in, use local root access to set a temporary password.
Keep the password out of command-line arguments and shell history:

```sh
cd /opt/openfieldservice
read -r -p 'Account email: ' RECOVERY_EMAIL
read -r -s -p 'New temporary password: ' RECOVERY_PASSWORD
printf '\n'
export RECOVERY_EMAIL RECOVERY_PASSWORD
pnpm users:reset-password
unset RECOVERY_EMAIL RECOVERY_PASSWORD
```

The command revokes existing sessions and requires the user to choose a new password
on sign-in. It refuses inactive or missing users. No password is printed.

## Verification

Automated tests exercise real password hashing, initial setup, cookie flags, session
revocation, forced password changes, role restrictions, private chats, team membership,
team messages and encrypted settings. Desktop Chrome proof uses an isolated local
preview, not the live LXC. Real AI calls require your configured model/provider.
Back up both databases and the private environment file; restoring only service
records will not restore accounts, team messages, saved knowledge or provider settings.
