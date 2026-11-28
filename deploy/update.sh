#!/usr/bin/env bash
# Debian/systemd single-instance updater. Run as root; custom paths use OFS_*.
set -Eeuo pipefail
# Git, pnpm and Vite create public runtime files read by a non-root service.
# Restrict backups explicitly instead of imposing owner-only modes on the checkout.
umask 022

usage() {
  cat <<'HELP'
Usage: ofs-update [--check]
Updates the configured checkout to origin/main with a stopped-service state backup,
frozen install, production build, typecheck, full tests and local health/session checks.
--check performs local preflight only: no fetch, service stop or update.
Overrides: OFS_APP_DIR, OFS_STATE_DIR, OFS_ENV_FILE, OFS_SERVICE,
           OFS_BACKUP_ROOT, OFS_BASE_URL, OFS_LOCK_FILE, OFS_INSTALL_PATH.
Backups are retained; a failed update never restores databases automatically.
HELP
}
check_only=0
case "${1:-}" in
  --help|-h) usage; exit 0 ;;
  --check) check_only=1 ;;
  '') ;;
  *) usage >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || { usage >&2; exit 2; }

app_dir=${OFS_APP_DIR:-/opt/openfieldservice}
state_dir=${OFS_STATE_DIR:-/var/lib/openfieldservice}
env_file=${OFS_ENV_FILE:-/etc/openfieldservice.env}
service=${OFS_SERVICE:-openfieldservice}
backup_root=${OFS_BACKUP_ROOT:-/var/backups/openfieldservice}
base_url=${OFS_BASE_URL:-http://127.0.0.1:3000}
lock_file=${OFS_LOCK_FILE:-/run/lock/openfieldservice-update.lock}
install_path=${OFS_INSTALL_PATH:-/usr/local/sbin/ofs-update}
backup_dir=''
previous_commit=''
stopped=0
stage=preflight
fail() { printf 'Update stopped: %s\n' "$*" >&2; exit 1; }
error() {
  local status=$?
  # ERR is inherited by command substitutions; only the parent reports/stops.
  if (( BASH_SUBSHELL > 0 )); then exit "$status"; fi
  trap - ERR INT TERM
  printf 'Update failed during: %s\n' "$stage" >&2
  [[ -z "$previous_commit" ]] || printf 'Previous commit: %s\n' "$previous_commit" >&2
  [[ -z "$backup_dir" ]] || printf 'Recovery files: %s\n' "$backup_dir" >&2
  printf 'Logs: journalctl -u %s -n 80 --no-pager\n' "$service" >&2
  exit "${status:-1}"
}
trap error ERR
trap 'exit 130' INT
trap 'exit 143' TERM
# EXIT also covers explicit failures and signals after the service has stopped.
cleanup() {
  local status=$?
  if (( BASH_SUBSHELL > 0 )); then return; fi
  if (( status != 0 && stopped )); then
    systemctl stop "$service" >/dev/null 2>&1 || true
    printf 'Service remains stopped; backup: %s\n' "${backup_dir:-not completed}" >&2
  fi
}
trap cleanup EXIT

[[ $(id -u) == 0 ]] || fail 'Run as root (sudo ofs-update).'
[[ "$service" =~ ^[a-zA-Z0-9_.@-]+$ ]] || fail 'Invalid service name.'
for path in "$app_dir" "$state_dir" "$env_file" "$backup_root" "$lock_file" "$install_path"; do
  [[ "$path" == /* && "$path" != / ]] || fail 'All configured paths must be absolute and must not be /.'
done
for command in git node pnpm systemctl curl flock cp mktemp install find chmod mv; do
  command -v "$command" >/dev/null || fail "Missing command: $command"
done
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]] || fail 'Install system-wide Node.js 24 before updating.'
[[ $(pnpm --version) == 11.20.0 ]] || fail 'Install pnpm@11.20.0 before updating.'
[[ -d "$state_dir" ]] || fail "State directory missing: $state_dir"
cd "$app_dir"
[[ $(git rev-parse --show-toplevel) == "$(pwd -P)" ]] || fail 'App directory must be the repository root.'
[[ -z $(git status --porcelain) ]] || fail 'Checkout has local changes. Preserve or commit them first; nothing was reset.'
[[ -f package.json && -f pnpm-lock.yaml && -f deploy/update.sh ]] || fail 'Incomplete application checkout.'
[[ $(systemctl show "$service" --property=LoadState --value) == loaded ]] || fail 'Systemd unit is not loaded.'

# When running, reject a backup path that excludes the effective database directory.
# Read only DATABASE_PATH; never print the process environment or secrets.
pid=$(systemctl show "$service" --property=MainPID --value)
if [[ "$pid" =~ ^[1-9][0-9]*$ && -r /proc/$pid/environ ]]; then
  node --input-type=module - "$pid" "$state_dir" "$app_dir" <<'NODE'
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
const [pid, state, app] = process.argv.slice(2);
const entry = readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').find(x => x.startsWith('DATABASE_PATH='));
const directory = realpathSync(dirname(resolve(app, entry ? entry.slice(14) : 'data/openfieldservice.sqlite')));
const difference = relative(realpathSync(state), directory);
if (difference === '..' || difference.startsWith('../') || isAbsolute(difference)) {
  console.error('Effective database is outside OFS_STATE_DIR; configure the correct state directory before updating.');
  process.exit(1);
}
NODE
fi
if (( check_only )); then
  printf 'Preflight passed. Checkout: %s; service: %s; state: %s\n' "$app_dir" "$service" "$state_dir"
  exit 0
fi
exec 9>"$lock_file"
flock -n 9 || fail 'Another update is running.'
stage='fetch main'
printf '\nFetching origin/main...\n'
git fetch origin refs/heads/main:refs/remotes/origin/main
target_commit=$(git rev-parse refs/remotes/origin/main)
previous_commit=$(git rev-parse HEAD)
if git show-ref --verify --quiet refs/heads/main; then
  git merge-base --is-ancestor refs/heads/main "$target_commit" || fail 'Local main diverged; resolve it without resetting business data.'
fi
# Keep backup/state disjoint so a backup can never recursively copy itself.
node --input-type=module - "$state_dir" "$backup_root" <<'NODE'
import { resolve, relative, isAbsolute } from 'node:path';
const [state, backup] = process.argv.slice(2).map(x => resolve(x));
const inside = (a,b) => { const r=relative(a,b); return r==='' || (r!=='..' && !r.startsWith('../') && !isAbsolute(r)); };
if (inside(state,backup) || inside(backup,state)) { console.error('Backup and state directories must be disjoint.'); process.exit(1); }
NODE
install -d -m 700 "$backup_root"
backup_dir=$(mktemp -d "$backup_root/update-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXXXX")
printf '%s\n' "$previous_commit" > "$backup_dir/previous-commit.txt"
printf '%s\n' "$target_commit" > "$backup_dir/target-commit.txt"
stage='stop and back up'
systemctl stop "$service"
stopped=1
if systemctl is-active --quiet "$service"; then fail 'Service is still active; refusing to copy live state.'; fi
cp -a "$state_dir" "$backup_dir/state"
if [[ -f "$env_file" ]]; then cp -a "$env_file" "$backup_dir/environment.env"; fi
systemctl cat "$service" > "$backup_dir/systemd-unit.txt"
printf 'Stopped-service backup: %s\n' "$backup_dir"

stage='fast-forward main'
[[ -z $(git status --porcelain) ]] || fail 'Checkout changed during preflight; preserve the edits before retrying.'
if git show-ref --verify --quiet refs/heads/main; then git switch main; else git switch --track -c main origin/main; fi
git merge --ff-only "$target_commit"
[[ $(git rev-parse HEAD) == "$target_commit" ]] || fail 'Checkout does not match the fetched release.'
stage='install dependencies'
pnpm install --frozen-lockfile
stage='production build'
pnpm build
stage='runtime file permissions'
# Only public source/dependency/build paths: never touch mutable state or env files.
chmod a+rx "$app_dir"
for public_dir in src node_modules dist; do
  [[ -d "$public_dir" ]] || fail "Missing runtime directory: $public_dir"
  find "$public_dir" -type d -exec chmod a+rx {} +
  find "$public_dir" -type f -exec chmod a+r {} +
  find "$public_dir" -type f -perm -100 -exec chmod a+x {} +
done
for public_file in package.json tsconfig.json; do
  [[ ! -f "$public_file" ]] || chmod a+r "$public_file"
done
stage='TypeScript check'
pnpm exec tsc --noEmit
stage='automated tests'
pnpm test
stage='restart and local health'
systemctl start "$service"
health=$(curl --fail --silent --show-error --retry 8 --retry-connrefused --retry-delay 1 --max-time 5 "${base_url%/}/healthz")
printf '%s' "$health" | node --input-type=module -e 'let s="";for await(const c of process.stdin)s+=c;if(JSON.parse(s).status!=="ok")process.exit(1)'
session=$(curl --fail --silent --show-error --max-time 10 "${base_url%/}/api/auth/session")
printf '%s' "$session" | node --input-type=module -e 'let s="";for await(const c of process.stdin)s+=c;if(typeof JSON.parse(s).setupRequired!=="boolean")process.exit(1)'
systemctl is-active --quiet "$service"
# Atomically refresh the installed command from the release just qualified.
stage='refresh updater command'
install -d "$(dirname "$install_path")"
updater_tmp=$(mktemp "$(dirname "$install_path")/.ofs-update-XXXXXXXX")
install -m 755 deploy/update.sh "$updater_tmp"
mv -f "$updater_tmp" "$install_path"
stopped=0
printf '\nUpdate complete: %s\nBackup retained: %s\nLocal health and session endpoints passed. Verify login and saved records in your browser.\n' "$target_commit" "$backup_dir"
