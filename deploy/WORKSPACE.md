# Self-hosted workspace

This adds the demo-style frame, Chat, Ask AI, Knowledge, AI connection status,
settings, and a review-first frontend app builder. It implements standalone
capabilities; it does not install Clawnify's hosting platform. The existing
schedule is the calendar. Clawnify account/team management, public website hosting,
arbitrary backend generation, and QuickBooks sync are not supplied by this slice.

## Login and configuration

Local login now protects the workspace and service APIs. Follow [Accounts and teams](ACCOUNTS.md)
to create the initial owner with your existing workspace key. Administrators can
configure AI connections directly under Integrations or Environment variables.
Saved keys are encrypted and are not returned to the browser. Server environment
configuration remains supported as an alternative:

Add any of these provider configurations in that file:

```ini
# Ollama on a machine reachable from the LXC. Use an installed model's exact name.
OLLAMA_BASE_URL=http://YOUR_OLLAMA_IP:11434
OLLAMA_MODEL=YOUR_INSTALLED_MODEL

# Hosted OpenAI connection. Use a model available to your API project.
OPENAI_API_KEY=YOUR_API_KEY
OPENAI_MODEL=YOUR_MODEL

# Hosted DeepSeek connection. Use the model name available to your API account.
DEEPSEEK_API_KEY=YOUR_DEEPSEEK_API_KEY
DEEPSEEK_MODEL=deepseek-flash
```

DeepSeek uses its [Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/).
The example model is configurable; use the exact supported model name for your account.

Ollama can run on another machine; running a model inside this 2 GB app container
is not assumed. The address/model are intentionally not guessed. Hosted API use
requires API credentials and can incur usage charges. The hosted connection uses
the [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)
with `store: false`. Ollama uses its [Chat API](https://docs.ollama.com/api/chat).
Provider settings and keys stay on the server; the browser receives only model
names and configuration status. There is no automatic provider fallback.

```sh
systemctl restart openfieldservice
curl --fail --retry 10 --retry-connrefused --retry-delay 1 http://127.0.0.1:3000/healthz
```

Open `/chat` after signing in. Integrations shows which providers have
settings present; this is not a connectivity test. Send a small message to prove
the real provider works. No real provider call was performed by automated tests.

## Chat and knowledge

New chats select Ollama, OpenAI or DeepSeek. A conversation keeps that provider. Chat history
is stored locally, and recent messages are included in follow-up requests. Add
procedures and handover notes under Knowledge (text only in this slice). The
assistant receives up to ten recently updated documents. Archiving retains the
record but excludes it from new knowledge snapshots; prior conversations can
still contain previously discussed information.

Messages and knowledge go to the selected provider. Customer, site, equipment and
job snapshots are added only when **Include records** is checked, with up to 30
recent records of each type. This is bounded context, not comprehensive search or
an autonomous agent. The assistant cannot change service records. Replies are
plain text so model output cannot inject HTML. No tools or shell commands from
model responses execute on the server.

## App builder: review, apply, rebuild

App builder now uses saved conversations. Describe a change, choose an AI provider,
and prepare a draft. Follow-up messages revise that draft while retaining earlier
edits. Recent drafts reopen their saved request/summary thread, and you can start a
new conversation for a separate change. Each revision is saved independently; an
older draft can be reopened to begin another branch of changes.

Automatic file selection is enabled by default and makes an additional AI request
using the request and available frontend file names. Under Advanced, turn it off
to choose files manually. Follow-ups retain existing draft files and may add files,
up to the same four-file limit. The generation request includes original source,
the previous cumulative draft, and up to ten recent request/summary turns. No
customer records, integration snapshots or provider keys enter the builder prompt.

Review highlights additions/removals with line numbers and collapses unchanged
context. Very large diffs show only the first 4,000 lines; inspect the full exported
before/after source locally. Check the review acknowledgment to enable download.
A source-hash change marks an old proposal stale and blocks further revisions;
start a new conversation against the current checkout. The deployment command
rechecks hashes, because the source can change after the browser's last check.
Generated drafts have not been compiled until that validation command runs.

Builder handles **existing frontend TypeScript/TSX/CSS files**, one to four per
proposal. It sends only the selected source files and your requested change to the
selected provider. It retains the original content/hashes, generated replacements,
and summary locally. Generation never edits the checkout or live service. Review
both sides carefully, then download the JSON proposal. No root shell, backend,
secrets, dependencies, service files or arbitrary filesystem paths are editable
through this interface.

Prepare a deployment user once, as root. The running service remains a separate
account whose data directory is not accessible to this user:

```sh
id openfieldservice-deploy || useradd --create-home --shell /bin/bash openfieldservice-deploy
chown -R openfieldservice-deploy:openfieldservice-deploy /opt/openfieldservice
```

Transfer the reviewed JSON to that user's home, then run as that user:

```sh
cd /opt/openfieldservice
pnpm builder:apply /home/openfieldservice-deploy/reviewed-proposal.json
```

The command refuses root, dirty checkouts, unexpected paths, and proposals whose
source hashes no longer match. It applies the replacements, typechecks, builds to
a temporary output directory, and then replaces `dist`. A validation/build failure
restores the source and leaves the previous `dist` intact. It strips provider keys
from build subprocess environments. This is a deliberate local deployment action,
not an automatic sandbox for untrusted code: review the code before applying.
Successful edits remain uncommitted for inspection; the command does not push or
restart services. Test in the browser, review `git diff`, and commit the change on
your own branch. The command only changes frontend files, so the Node API does not
need a restart. Keep a separate staging deployment for higher-risk changes.

## Workspace data and backups

`workspace.sqlite` is stored beside `openfieldservice.sqlite` in the state directory.
It contains conversations, knowledge and proposals. Back up **both databases**:

```sh
cd /opt/openfieldservice
install -d -m 700 /var/backups/openfieldservice
BACKUP_TIME=$(date -u +%Y%m%dT%H%M%SZ)
DATABASE_PATH=/var/lib/openfieldservice/openfieldservice.sqlite pnpm db:backup "/var/backups/openfieldservice/service-$BACKUP_TIME.sqlite"
DATABASE_PATH=/var/lib/openfieldservice/workspace.sqlite pnpm db:backup "/var/backups/openfieldservice/workspace-$BACKUP_TIME.sqlite"
```

These are separate snapshots, not an atomic cross-database backup. Chats and
proposals do not write service records. Apply the same stopped-service restore and
WAL-sidecar precautions described in README.md. Backups and exported proposals can
contain private data/source; keep them private.
