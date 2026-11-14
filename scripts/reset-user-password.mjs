import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { passwordHash } from '../src/server/auth.mjs';
if (process.getuid?.() !== 0) throw new Error('Run account recovery as root on the LXC.');
const filename = process.env.WORKSPACE_DATABASE_PATH ?? '/var/lib/openfieldservice/workspace.sqlite';
const email = process.env.RECOVERY_EMAIL?.trim().toLowerCase();
const password = process.env.RECOVERY_PASSWORD;
if (!email || !password || password.length < 12 || password.length > 128) throw new Error('Set RECOVERY_EMAIL and RECOVERY_PASSWORD (12–128 characters) in the environment.');
if (!existsSync(filename)) throw new Error('Workspace database not found.');
const db = new DatabaseSync(filename);
try {
  db.exec('PRAGMA busy_timeout=5000');
  const user = db.prepare('SELECT id FROM users WHERE email=? AND active=1').get(email);
  if (!user) throw new Error('Active user not found.');
  const encoded = await passwordHash(password);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE users SET password_hash=?,must_change_password=1 WHERE id=?').run(encoded, user.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  console.log('Temporary password set. Existing sessions revoked. User must change it at sign-in.');
} finally { db.close(); }
