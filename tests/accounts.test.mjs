import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createAuth } from '../src/server/auth.mjs';
import { createWorkspace } from '../src/server/workspace.mjs';
import { openStorage } from '../src/server/sqlite.mjs';

const bootstrap = 'a-test-bootstrap-key-with-more-than-24-characters';
const initialPassword = 'First temporary password!';
const permanentPassword = 'A different permanent password!';

test('local accounts protect all APIs, enforce roles, isolate chats and preserve team data', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ofs-accounts-'));
  const filename = join(directory, 'workspace.sqlite');
  const env = { WORKSPACE_TOKEN: bootstrap, OLLAMA_BASE_URL: 'http://fixture.invalid', OLLAMA_MODEL: 'fixture', PUBLIC_URL: 'https://field.example' };
  const storage = openStorage(join(directory, 'service.sqlite'));
  const auth = createAuth({ filename, env });
  const workspace = createWorkspace({ filename, storage, root: new URL('../', import.meta.url).pathname, env, fetcher: async () => Response.json({ message: { content: 'Service answer' } }) });
  const app = new Hono(); app.use('/api/*', auth.guard); app.route('/api/auth', auth.app); app.route('/api/workspace', workspace.app);
  app.get('/api/public/company', c => workspace.publicCompany(c));
  app.get('/api/jobs', c => c.json({ jobs: [] })); app.post('/api/jobs', c => c.json({ ok: true }));
  let ownerCookie;
  async function request(path, { method = 'GET', body, cookie, expected = 200, verify = true, bearer } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (verify) headers['X-Requested-With'] = 'OpenFieldService';
    if (cookie) headers.Cookie = cookie;
    if (bearer) headers.Authorization = 'Bearer ' + bearer;
    const response = await app.request('/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    assert.equal(response.status, expected, path + ': ' + JSON.stringify(data));
    return { data, cookie: response.headers.get('Set-Cookie')?.split(';')[0], headers: response.headers };
  }
  try {
    assert.equal((await request('/auth/session')).data.setupRequired, true);
    await request('/jobs', { expected: 401 });
    await request('/workspace/status', { bearer: bootstrap, expected: 401 });
    await request('/auth/setup', { method: 'POST', body: { bootstrapToken: 'wrong' }, expected: 403 });
    const setup = await request('/auth/setup', { method: 'POST', body: { name: 'Owner', email: 'owner@example.test', password: initialPassword, bootstrapToken: bootstrap }, expected: 201 });
    ownerCookie = setup.cookie; const owner = setup.data.user;
    assert.match(setup.headers.get('Set-Cookie'), /HttpOnly/); assert.match(setup.headers.get('Set-Cookie'), /Secure/); assert.match(setup.headers.get('Set-Cookie'), /SameSite=Strict/);
    await request('/auth/setup', { method: 'POST', body: {}, expected: 409 });
    await request('/jobs', { cookie: ownerCookie });
    await request('/jobs', { cookie: ownerCookie, method: 'POST', verify: false, body: {}, expected: 403 });
    const audit = new DatabaseSync(filename, { readOnly: true });
    const stored = audit.prepare('SELECT password_hash FROM users WHERE id=?').get(owner.id).password_hash;
    assert.ok(!stored.includes(initialPassword));
    assert.notEqual(audit.prepare('SELECT token_hash FROM sessions').get().token_hash, ownerCookie.split('=')[1]);
    audit.close();
    async function createUser(email, role) {
      const created = await request('/auth/users', { method: 'POST', cookie: ownerCookie, body: { name: role, email, role, password: initialPassword }, expected: 201 });
      const login = await request('/auth/login', { method: 'POST', body: { email, password: initialPassword } });
      await request('/jobs', { cookie: login.cookie, expected: 403 });
      const changed = await request('/auth/password', { method: 'POST', cookie: login.cookie, body: { currentPassword: initialPassword, password: permanentPassword } });
      await request('/jobs', { cookie: login.cookie, expected: 401 });
      return { user: created.data.user, cookie: changed.cookie };
    }
    const member = await createUser('member@example.test', 'member');
    const viewer = await createUser('viewer@example.test', 'viewer');
    const administrator = await createUser('admin@example.test', 'admin');
    await request('/auth/users', { cookie: member.cookie, expected: 403 });
    await request('/workspace/configuration', { cookie: member.cookie, expected: 403 });
    await request('/workspace/builder/files', { cookie: member.cookie, expected: 403 });
    await request('/jobs', { cookie: viewer.cookie, method: 'POST', body: {}, expected: 403 });
    await request('/workspace/knowledge', { cookie: viewer.cookie, method: 'POST', body: { title: 'No', content: 'No' }, expected: 403 });
    await request('/auth/users', { cookie: administrator.cookie, method: 'POST', body: { name: 'Escalation', email: 'escalate@example.test', role: 'admin', password: initialPassword }, expected: 403 });
    await request('/auth/users/' + owner.id, { cookie: ownerCookie, method: 'PUT', body: { name: 'No', role: 'viewer', active: false }, expected: 403 });
    await request('/workspace/configuration', { cookie: ownerCookie, method: 'PUT', body: { values: { DEEPSEEK_API_KEY: 'sensitive-key-for-test', DEEPSEEK_MODEL: 'test-model' } } });
    const config = (await request('/workspace/configuration', { cookie: ownerCookie })).data;
    assert.equal(config.secrets.DEEPSEEK_API_KEY, true); assert.ok(!JSON.stringify(config).includes('sensitive-key-for-test'));
    const db = new DatabaseSync(filename, { readOnly: true }); assert.ok(!db.prepare('SELECT value FROM configuration WHERE name=?').get('DEEPSEEK_API_KEY').value.includes('sensitive-key-for-test')); db.close();
    const firstChat = (await request('/workspace/chat', { cookie: ownerCookie, method: 'POST', body: { provider: 'ollama', message: 'Private owner chat', includeRecords: false } })).data;
    await request('/workspace/conversations/' + firstChat.conversationId, { cookie: member.cookie, expected: 404 });
    assert.equal((await request('/workspace/conversations', { cookie: member.cookie })).data.conversations.length, 0);
    const createdTeam = (await request('/auth/teams', { cookie: ownerCookie, method: 'POST', body: { name: 'Controls', description: 'Controls specialists' }, expected: 201 })).data;
    await request('/auth/teams/' + createdTeam.id + '/members', { cookie: ownerCookie, method: 'PUT', body: { userIds: [owner.id, member.user.id] } });
    await request('/auth/teams/' + createdTeam.id, { cookie: viewer.cookie, expected: 404 });
    await request('/auth/teams/' + createdTeam.id + '/members', { cookie: member.cookie, method: 'PUT', body: { userIds: [viewer.user.id] }, expected: 403 });
    await request('/auth/teams/' + createdTeam.id + '/messages', { cookie: member.cookie, method: 'POST', body: { content: 'Controls handover ready.' }, expected: 201 });
    assert.equal((await request('/auth/teams/' + createdTeam.id, { cookie: ownerCookie })).data.messages[0].content, 'Controls handover ready.');
    // HR can administer people without receiving configuration, Builder or message access.
    const hr = await createUser('hr@example.test', 'member');
    await request('/auth/users/' + hr.user.id, { cookie: ownerCookie, method: 'PUT', body: { name: 'HR', role: 'member', active: true, hr: true } });
    await request('/jobs', { cookie: hr.cookie, expected: 401 });
    hr.cookie = (await request('/auth/login', { method: 'POST', body: { email: 'hr@example.test', password: permanentPassword } })).cookie;
    const hrSession = (await request('/auth/session', { cookie: hr.cookie })).data.user;
    assert.equal(hrSession.hr, true);
    await request('/auth/users', { cookie: hr.cookie });
    await request('/workspace/configuration', { cookie: hr.cookie, expected: 403 });
    await request('/workspace/builder/files', { cookie: hr.cookie, expected: 403 });
    const privateTeam = (await request('/auth/teams/' + createdTeam.id, { cookie: hr.cookie })).data;
    assert.equal(privateTeam.canReadMessages, false); assert.deepEqual(privateTeam.messages, []);
    await request('/auth/teams/' + createdTeam.id + '/messages', { cookie: hr.cookie, method: 'POST', body: { content: 'Cannot post without membership' }, expected: 403 });
    for (const protectedUser of [owner, administrator.user, hr.user]) {
      await request('/auth/users/' + protectedUser.id, { cookie: hr.cookie, method: 'PUT', body: { name: 'Changed', role: 'viewer', active: false }, expected: 403 });
      await request('/auth/users/' + protectedUser.id + '/reset-password', { cookie: hr.cookie, method: 'POST', body: { password: initialPassword }, expected: 403 });
    }
    for (const privileges of [{ role: 'admin' }, { role: 'member', hr: true }]) {
      await request('/auth/users', { cookie: hr.cookie, method: 'POST', body: { name: 'Forbidden', email: 'forbidden@example.test', password: initialPassword, ...privileges }, expected: 403 });
      await request('/auth/users/' + member.user.id, { cookie: hr.cookie, method: 'PUT', body: { name: 'Forbidden', active: true, ...privileges }, expected: 403 });
    }
    const ordinary = (await request('/auth/users', { cookie: hr.cookie, method: 'POST', body: { name: 'Ordinary', email: 'ordinary@example.test', password: initialPassword, role: 'viewer' }, expected: 201 })).data.user;
    await request('/auth/users/' + ordinary.id + '/reset-password', { cookie: hr.cookie, method: 'POST', body: { password: permanentPassword } });
    await request('/auth/users/' + ordinary.id, { cookie: hr.cookie, method: 'PUT', body: { name: 'Updated ordinary', role: 'member', active: true } });
    await request('/auth/teams/' + createdTeam.id + '/members', { cookie: hr.cookie, method: 'PUT', body: { userIds: [owner.id, member.user.id, ordinary.id] } });
    assert.equal((await request('/auth/teams/' + createdTeam.id, { cookie: hr.cookie })).data.canReadMessages, false);
    await request('/auth/profile', { cookie: member.cookie, method: 'PUT', body: { name: 'Updated member', role: 'owner', hr: true } });
    const profile = (await request('/auth/session', { cookie: member.cookie })).data.user;
    assert.equal(profile.name, 'Updated member'); assert.equal(profile.role, 'member'); assert.equal(profile.hr, false);
    // A target promoted while asynchronous password hashing is in flight stays protected.
    const resetPending = request('/auth/users/' + ordinary.id + '/reset-password', { cookie: hr.cookie, method: 'POST', body: { password: 'Race replacement password!' }, expected: 403 });
    await new Promise(resolve => setTimeout(resolve, 30));
    await request('/auth/users/' + ordinary.id, { cookie: ownerCookie, method: 'PUT', body: { name: 'Now privileged', role: 'admin', active: true } });
    await resetPending;
    await request('/public/company', { expected: 404 });
    await request('/workspace/configuration', { cookie: ownerCookie, method: 'PUT', body: { values: { COMPANY_NAME: 'Test service company', COMPANY_PUBLIC: 'true' } } });
    const company = (await request('/public/company')).data; assert.equal(company.name, 'Test service company'); assert.ok(!JSON.stringify(company).includes('sensitive-key-for-test'));
    await request('/auth/users/' + member.user.id, { cookie: ownerCookie, method: 'PUT', body: { name: 'member', role: 'member', active: false } });
    await request('/jobs', { cookie: member.cookie, expected: 401 });
    await request('/auth/logout', { cookie: ownerCookie, method: 'POST' });
    await request('/jobs', { cookie: ownerCookie, expected: 401 });
  } finally { workspace.close(); auth.close(); storage.close(); rmSync(directory, { recursive: true, force: true }); }
});
