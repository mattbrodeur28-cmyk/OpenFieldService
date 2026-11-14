import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { DatabaseSync } from 'node:sqlite';
import { scrypt as scryptCallback, randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const hash = value => createHash('sha256').update(value).digest('hex');
const cookieName = 'ofs_session';
const admin = user => user && ['owner', 'admin'].includes(user.role);
const validPassword = value => typeof value === 'string' && value.length >= 12 && value.length <= 128;
const validName = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 100;
const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, salt, 64, { N: 65536, r: 8, p: 2, maxmem: 128 * 1024 * 1024 });
  return `${salt}:${derived.toString('hex')}`;
}
async function passwordMatches(password, stored) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const calculated = await passwordHash(password, stored.split(':')[0]);
  return timingSafeEqual(Buffer.from(calculated), Buffer.from(stored));
}
const publicUser = row => row ? ({ id: row.id, name: row.name, email: row.email, role: row.role, active: Boolean(row.active), mustChangePassword: Boolean(row.must_change_password) }) : null;

export function createAuth({ filename, env = process.env }) {
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','admin','member','viewer')),active INTEGER NOT NULL DEFAULT 1,must_change_password INTEGER NOT NULL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS teams(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,description TEXT NOT NULL DEFAULT '',archived INTEGER NOT NULL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS team_members(team_id TEXT REFERENCES teams(id),user_id TEXT REFERENCES users(id),PRIMARY KEY(team_id,user_id));
    CREATE TABLE IF NOT EXISTS team_messages(id TEXT PRIMARY KEY,team_id TEXT REFERENCES teams(id),user_id TEXT REFERENCES users(id),content TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
  const app = new Hono();
  app.use('*', bodyLimit({ maxSize: 20000, onError: c => c.json({ error: 'Request too large.' }, 413) }));
  const attempts = new Map();
  const testMode = env.NODE_ENV === 'test' && env.AUTH_TEST_MODE === '1';
  function userFor(c) {
    const token = getCookie(c, cookieName);
    if (!token) return null;
    return publicUser(db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1').get(hash(token), Date.now()));
  }
  function issueSession(c, user) {
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hash(token), user.id, Date.now() + 7 * 86400000);
    setCookie(c, cookieName, token, { path: '/', httpOnly: true, sameSite: 'Strict', secure: env.PUBLIC_URL?.startsWith('https://') ?? false, maxAge: 7 * 86400 });
  }
  function throttle(key) {
    const now = Date.now();
    for (const [name, item] of attempts) if (item.until < now) attempts.delete(name);
    const entry = attempts.get(key) ?? { count: 0, until: now + 15 * 60000 };
    entry.count++; attempts.set(key, entry);
    return entry.count > 10 || attempts.size > 1000;
  }
  const guard = async (c, next) => {
    const publicPaths = ['/api/auth/session', '/api/auth/login', '/api/auth/setup', '/api/public/company'];
    // One-use, user-bound OAuth state validates cross-site callbacks without a session cookie.
    if (/^\/api\/integrations\/(google|microsoft|hubspot|linkedin)\/callback$/.test(c.req.path) && c.req.method === 'GET') return next();
    if (publicPaths.includes(c.req.path)) return next();
    if (testMode) {
      c.set('user', { id: 'test-user', name: 'Test owner', email: 'test@example.test', role: 'owner', active: true, mustChangePassword: false });
      return next();
    }
    const user = userFor(c);
    if (!user) return c.json({ error: 'Sign in to continue.' }, 401);
    c.set('user', user);
    if (user.mustChangePassword && !['/api/auth/password', '/api/auth/logout'].includes(c.req.path)) return c.json({ error: 'Change your temporary password before continuing.', passwordChangeRequired: true }, 403);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      if (c.req.header('X-Requested-With') !== 'OpenFieldService') return c.json({ error: 'Missing request verification header.' }, 403);
      if (user.role === 'viewer' && !c.req.path.startsWith('/api/auth/') && !c.req.path.startsWith('/api/workspace/')) return c.json({ error: 'Your account has read-only access.' }, 403);
    }
    return next();
  };
  app.onError((error, c) => {
    console.error('Account request failed:', error.name);
    return c.json({ error: 'The account operation could not be completed.' }, 500);
  });
  app.use('*', async (c, next) => {
    if (!['GET', 'HEAD'].includes(c.req.method) && c.req.header('X-Requested-With') !== 'OpenFieldService') return c.json({ error: 'Missing request verification header.' }, 403);
    if (Number(c.req.header('Content-Length') ?? 0) > 20000) return c.json({ error: 'Request too large.' }, 413);
    await next();
  });
  async function body(c) { const raw = await c.req.text(); if (raw.length > 20000) return null; try { return JSON.parse(raw); } catch { return null; } }
  app.get('/session', c => c.json({ user: userFor(c), setupRequired: db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0, canBootstrap: Boolean(env.WORKSPACE_TOKEN?.length >= 24) }));
  app.post('/setup', async c => {
    if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n) return c.json({ error: 'The workspace already has an owner.' }, 409);
    if (throttle('setup')) return c.json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
    const input = await body(c);
    if (!env.WORKSPACE_TOKEN || env.WORKSPACE_TOKEN.length < 24 || !input || typeof input.bootstrapToken !== 'string' || !timingSafeEqual(Buffer.from(hash(input.bootstrapToken)), Buffer.from(hash(env.WORKSPACE_TOKEN)))) return c.json({ error: 'The existing workspace access key is required to create the first owner.' }, 403);
    if (!validName(input.name) || !validEmail(input.email) || !validPassword(input.password)) return c.json({ error: 'Enter a name, valid email, and password of 12–128 characters.' }, 400);
    const password = await passwordHash(input.password);
    const id = randomUUID();
    db.exec('BEGIN IMMEDIATE');
    try {
      if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n) { db.exec('ROLLBACK'); return c.json({ error: 'The workspace already has an owner.' }, 409); }
      db.prepare("INSERT INTO users(id,name,email,password_hash,role) VALUES(?,?,?,?,'owner')").run(id, input.name.trim(), input.email.trim().toLowerCase(), password);
      const teamId = randomUUID();
      db.prepare('INSERT INTO teams(id,name,description) VALUES(?,?,?)').run(teamId, 'Field Service', 'Your service team');
      db.prepare('INSERT INTO team_members(team_id,user_id) VALUES(?,?)').run(teamId, id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    const user = publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(id));
    issueSession(c, user); return c.json({ user }, 201);
  });
  app.post('/login', async c => {
    const input = await body(c);
    if (!input || !validEmail(input.email) || typeof input.password !== 'string' || input.password.length > 128) return c.json({ error: 'Email or password is incorrect.' }, 401);
    const email = input.email.trim().toLowerCase();
    if (throttle('login:' + email)) return c.json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
    const row = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    const fallback = '0'.repeat(32) + ':' + '0'.repeat(128);
    const matches = await passwordMatches(input.password, row?.password_hash ?? fallback);
    if (!row || !matches || !row.active) return c.json({ error: 'Email or password is incorrect.' }, 401);
    attempts.delete('login:' + email);
    const user = publicUser(row); issueSession(c, user); return c.json({ user });
  });
  app.post('/logout', c => {
    const token = getCookie(c, cookieName);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));
    deleteCookie(c, cookieName, { path: '/' }); return c.json({ ok: true });
  });
  app.post('/password', async c => {
    const user = c.get('user'); const input = await body(c);
    if (!input || !validPassword(input.password)) return c.json({ error: 'Choose a password of 12–128 characters.' }, 400);
    if (throttle('password:' + user.id)) return c.json({ error: 'Too many attempts. Try again later.' }, 429);
    const row = db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id);
    if (!await passwordMatches(input.currentPassword, row.password_hash)) return c.json({ error: 'Current password is incorrect.' }, 403);
    const nextHash = await passwordHash(input.password);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?').run(nextHash, user.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id); db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    issueSession(c, user); return c.json({ ok: true });
  });
  app.get('/users', c => admin(c.get('user')) ? c.json({ users: db.prepare('SELECT * FROM users ORDER BY name').all().map(publicUser) }) : c.json({ error: 'Administrator access required.' }, 403));
  app.post('/users', async c => {
    const actor = c.get('user'); if (!admin(actor)) return c.json({ error: 'Administrator access required.' }, 403);
    const input = await body(c);
    if (!input || !validName(input.name) || !validEmail(input.email) || !validPassword(input.password) || !['admin', 'member', 'viewer'].includes(input.role)) return c.json({ error: 'Enter a name, email, role and temporary password of 12–128 characters.' }, 400);
    if (input.role === 'admin' && actor.role !== 'owner') return c.json({ error: 'Only the owner can create administrators.' }, 403);
    if (db.prepare('SELECT id FROM users WHERE email=?').get(input.email.trim().toLowerCase())) return c.json({ error: 'A user with this email already exists.' }, 409);
    const encoded = await passwordHash(input.password); const id = randomUUID();
    db.prepare('INSERT INTO users(id,name,email,password_hash,role,must_change_password) VALUES(?,?,?,?,?,1)').run(id, input.name.trim(), input.email.trim().toLowerCase(), encoded, input.role);
    return c.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(id)) }, 201);
  });
  app.put('/users/:id', async c => {
    const actor = c.get('user'); if (!admin(actor)) return c.json({ error: 'Administrator access required.' }, 403);
    const target = db.prepare('SELECT * FROM users WHERE id=?').get(c.req.param('id')); const input = await body(c);
    if (!target) return c.json({ error: 'User not found.' }, 404);
    if (target.role === 'owner' || target.id === actor.id || (target.role === 'admin' && actor.role !== 'owner')) return c.json({ error: 'This account is protected. Use your account settings for password changes.' }, 403);
    if (!input || !validName(input.name) || !['admin', 'member', 'viewer'].includes(input.role) || typeof input.active !== 'boolean') return c.json({ error: 'Invalid user update.' }, 400);
    if (input.role === 'admin' && actor.role !== 'owner') return c.json({ error: 'Only the owner can grant administrator access.' }, 403);
    db.prepare('UPDATE users SET name=?,role=?,active=? WHERE id=?').run(input.name.trim(), input.role, Number(input.active), target.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id); return c.json({ ok: true });
  });
  app.post('/users/:id/reset-password', async c => {
    const actor = c.get('user'); if (!admin(actor)) return c.json({ error: 'Administrator access required.' }, 403);
    const target = db.prepare('SELECT * FROM users WHERE id=?').get(c.req.param('id')); const input = await body(c);
    if (!target) return c.json({ error: 'User not found.' }, 404);
    if (target.role === 'owner' || target.id === actor.id || (target.role === 'admin' && actor.role !== 'owner')) return c.json({ error: 'This account is protected.' }, 403);
    if (!input || !validPassword(input.password)) return c.json({ error: 'Temporary password must contain 12–128 characters.' }, 400);
    const encoded = await passwordHash(input.password);
    db.prepare('UPDATE users SET password_hash=?,must_change_password=1 WHERE id=?').run(encoded, target.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id); return c.json({ ok: true });
  });
  app.get('/teams', c => {
    const actor = c.get('user');
    const teams = admin(actor) ? db.prepare('SELECT t.*,(SELECT COUNT(*) FROM team_members m JOIN users u ON u.id=m.user_id WHERE m.team_id=t.id AND u.active=1) AS member_count FROM teams t WHERE archived=0 ORDER BY name').all()
      : db.prepare('SELECT t.*,(SELECT COUNT(*) FROM team_members m JOIN users u ON u.id=m.user_id WHERE m.team_id=t.id AND u.active=1) AS member_count FROM teams t JOIN team_members mine ON mine.team_id=t.id WHERE mine.user_id=? AND t.archived=0 ORDER BY name').all(actor.id);
    return c.json({ teams });
  });
  function teamAccess(c) {
    const team = db.prepare('SELECT * FROM teams WHERE id=? AND archived=0').get(c.req.param('id'));
    if (!team) return null;
    const actor = c.get('user');
    return admin(actor) || db.prepare('SELECT 1 FROM team_members WHERE team_id=? AND user_id=?').get(team.id, actor.id) ? team : null;
  }
  app.get('/teams/:id', c => {
    const team = teamAccess(c); if (!team) return c.json({ error: 'Team not found or access denied.' }, 404);
    const members = db.prepare('SELECT u.* FROM users u JOIN team_members m ON m.user_id=u.id WHERE m.team_id=? ORDER BY u.name').all(team.id).map(publicUser);
    const messages = db.prepare('SELECT m.id,m.content,m.created_at,u.name AS author FROM team_messages m JOIN users u ON u.id=m.user_id WHERE team_id=? ORDER BY m.rowid DESC LIMIT 100').all(team.id).reverse();
    return c.json({ team, members, messages });
  });
  app.post('/teams', async c => {
    if (!admin(c.get('user'))) return c.json({ error: 'Administrator access required.' }, 403);
    const input = await body(c);
    if (!input || !validName(input.name) || typeof input.description !== 'string' || input.description.length > 1000) return c.json({ error: 'Enter a team name and description.' }, 400);
    if (db.prepare('SELECT id FROM teams WHERE name=?').get(input.name.trim())) return c.json({ error: 'A team with this name already exists.' }, 409);
    const id = randomUUID(); db.prepare('INSERT INTO teams(id,name,description) VALUES(?,?,?)').run(id, input.name.trim(), input.description);
    db.prepare('INSERT INTO team_members(team_id,user_id) VALUES(?,?)').run(id, c.get('user').id); return c.json({ id }, 201);
  });
  app.put('/teams/:id/members', async c => {
    if (!admin(c.get('user'))) return c.json({ error: 'Administrator access required.' }, 403);
    const team = teamAccess(c); const input = await body(c);
    if (!team) return c.json({ error: 'Team not found.' }, 404);
    if (!input || !Array.isArray(input.userIds) || input.userIds.length > 500 || input.userIds.some(id => typeof id !== 'string' || !db.prepare('SELECT id FROM users WHERE id=? AND active=1').get(id))) return c.json({ error: 'Choose active users for the team.' }, 400);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM team_members WHERE team_id=?').run(team.id);
      for (const id of new Set(input.userIds)) db.prepare('INSERT INTO team_members(team_id,user_id) VALUES(?,?)').run(team.id, id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return c.json({ ok: true });
  });
  app.post('/teams/:id/messages', async c => {
    const team = teamAccess(c); if (!team) return c.json({ error: 'Team not found or access denied.' }, 404);
    if (c.get('user').role === 'viewer') return c.json({ error: 'Your account has read-only access.' }, 403);
    const input = await body(c);
    if (!input || typeof input.content !== 'string' || !input.content.trim() || input.content.length > 8000) return c.json({ error: 'Enter a message of up to 8,000 characters.' }, 400);
    const id = randomUUID(); db.prepare('INSERT INTO team_messages(id,team_id,user_id,content) VALUES(?,?,?,?)').run(id, team.id, c.get('user').id, input.content); return c.json({ id }, 201);
  });
  return { app, guard, close: () => db.close() };
}
