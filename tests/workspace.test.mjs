import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkspace, modelReply, validateProposal, sourceFile } from '../src/server/workspace.mjs';
import { openStorage } from '../src/server/sqlite.mjs';

const token = 'test-workspace-token-at-least-24-characters';
test('workspace protects secrets, preserves chats/knowledge, and validates builder proposals', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ofs-workspace-'));
  const storage = openStorage(join(directory, 'service.sqlite'));
  const root = new URL('../', import.meta.url).pathname;
  const filename = join(directory, 'workspace.sqlite');
  const calls = [];
  let reply = 'The saved knowledge says to inspect filters.';
  let failure = false;
  const env = { WORKSPACE_TOKEN: token, OLLAMA_BASE_URL: 'http://fixture.invalid:11434', OLLAMA_MODEL: 'fixture-model', OPENAI_API_KEY: 'secret-fixture', OPENAI_MODEL: 'fixture-hosted' };
  const fetcher = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (failure) return new Response('Provider failure containing secret', { status: 503 });
    return Response.json({ message: { content: reply } });
  };
  let workspace = createWorkspace({ filename, storage, root, env, fetcher });
  async function api(path, method = 'GET', body, key = token, expected = 200) {
    const result = await workspace.app.request(path, { method, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await result.json();
    assert.equal(result.status, expected, JSON.stringify(data));
    return data;
  }
  try {
    await api('/status', 'GET', undefined, 'wrong-key', 401);
    assert.ok(!JSON.stringify(await api('/status')).includes('secret-fixture'));
    const doc = await api('/knowledge', 'POST', { title: 'AHU checklist', content: 'Inspect filters before checkout.' });
    const customer = storage.database.prepare("INSERT INTO customers(name) VALUES('Private customer') RETURNING id").get();
    const chat = await api('/chat', 'POST', { provider: 'ollama', message: 'How should I inspect the AHU?', includeRecords: false });
    assert.ok(calls[0].body.messages[0].content.includes('Inspect filters'));
    assert.ok(!calls[0].body.messages[0].content.includes('Private customer'));
    await api('/chat', 'POST', { provider: 'ollama', conversationId: chat.conversationId, message: 'What customers are present?', includeRecords: true });
    assert.ok(calls[1].body.messages[0].content.includes('Private customer'));
    assert.ok(calls[1].body.messages[0].content.includes(customer.id));
    await api('/chat', 'POST', { provider: 'openai', conversationId: chat.conversationId, message: 'Switch provider', includeRecords: false }, token, 409);
    failure = true;
    const failed = await api('/chat', 'POST', { provider: 'ollama', message: 'This request fails', includeRecords: false }, token, 502);
    assert.ok(!JSON.stringify(failed).includes('containing secret'));
    assert.equal((await api('/conversations')).conversations.length, 1, 'failed replies must not appear saved');
    failure = false;
    await api('/knowledge/' + doc.id + '/archive', 'POST');
    assert.equal((await api('/knowledge')).documents.length, 0);
    const path = 'src/client/components/sidebar.tsx';
    const source = sourceFile(root, path);
    reply = JSON.stringify({ summary: 'Update sidebar', files: [{ path, content: source.content + '\n// proposed change\n' }] });
    const proposal = await api('/builder/proposals', 'POST', { provider: 'ollama', message: 'Update sidebar', files: [path] }, token, 201);
    assert.equal(proposal.files[0].before, source.content);
    assert.equal(readFileSync(join(root, path), 'utf8'), source.content, 'generating a proposal must not modify source');
    validateProposal(root, proposal);
    assert.throws(() => validateProposal(root, { files: [{ ...proposal.files[0], sha256: 'stale' }] }), /Source changed/);
    reply = JSON.stringify({ summary: 'Invalid path', files: [{ path: '../../etc/passwd', content: 'bad' }] });
    await api('/builder/proposals', 'POST', { provider: 'ollama', message: 'Invalid', files: [path] }, token, 422);
    assert.throws(() => sourceFile(root, '../../etc/passwd'));
    assert.throws(() => sourceFile(root, 'src/server/node.ts'));
    workspace.close();
    workspace = createWorkspace({ filename, storage, root, env, fetcher });
    assert.equal((await api('/conversations/' + chat.conversationId)).messages.length, 4);
    assert.equal((await api('/builder/proposals/' + proposal.id)).files[0].sha256, source.sha256);
  } finally { workspace.close(); storage.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('hosted provider uses Responses with storage disabled and parses all text outputs', async () => {
  const reply = await modelReply('openai', 'Instructions', [{ role: 'user', content: 'Question' }], { OPENAI_API_KEY: 'fixture-secret', OPENAI_MODEL: 'configured-model' }, async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization, 'Bearer fixture-secret');
    assert.equal(JSON.parse(options.body).store, false);
    assert.equal(JSON.parse(options.body).model, 'configured-model');
    return Response.json({ output: [{ type: 'reasoning' }, { content: [{ type: 'output_text', text: 'Answer' }] }] });
  });
  assert.equal(reply, 'Answer');
  await assert.rejects(() => modelReply('ollama', '', [], {}), /Configure OLLAMA/);
});
