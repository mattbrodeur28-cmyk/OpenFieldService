import { readFileSync, writeFileSync, realpathSync, renameSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateProposal } from '../src/server/workspace.mjs';

const root = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
process.chdir(root);
if (process.getuid?.() === 0) throw new Error('Run this as your non-root deployment user, not root. Review the proposal first.');
const file = process.argv[2];
if (!file) throw new Error('Usage: pnpm builder:apply /path/to/reviewed-proposal.json');
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()) throw new Error('Checkout must be clean before applying a proposal');
const proposal = validateProposal(root, JSON.parse(readFileSync(file, 'utf8')));
const before = proposal.files.map(item => ({ path: item.path, content: readFileSync(resolve(root, item.path), 'utf8') }));
const buildEnv = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'LANG'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
buildEnv.NODE_ENV = 'production';
const suffix = randomUUID();
const staging = '.builder-dist-' + suffix;
const previous = '.builder-previous-' + suffix;
function build() {
  execFileSync('pnpm', ['exec', 'tsc', '--noEmit'], { stdio: 'inherit', env: buildEnv });
  execFileSync('pnpm', ['exec', 'vite', 'build', '--outDir', staging], { stdio: 'inherit', env: buildEnv });
}
try {
  for (const item of proposal.files) writeFileSync(resolve(root, item.path), item.content);
  build();
  if (existsSync('dist')) renameSync('dist', previous);
  try { renameSync(staging, 'dist'); }
  catch (error) { if (existsSync(previous)) renameSync(previous, 'dist'); throw error; }
  if (existsSync(previous)) rmSync(previous, { recursive: true });
} catch (error) {
  for (const item of before) writeFileSync(resolve(root, item.path), item.content);
  if (existsSync(staging)) rmSync(staging, { recursive: true });
  throw error;
}
console.log('Proposal applied and build passed. Review git diff, test the app, then commit these changes.');
console.log('The service was not restarted and no GitHub changes were pushed.');
