import { useEffect, useState } from 'preact/hooks';
import type { View } from '../types';

type Provider = { id: string; label: string; model: string; configured: boolean };
type Document = { id: string; title: string; content: string };
type Message = { role: string; content: string };
type Proposal = { id: string; summary: string; files: { path: string; before: string; content: string; sha256: string }[] };
const titles: Record<string, string> = { chat: 'Chat', knowledge: 'Knowledge', integrations: 'Integrations', builder: 'App builder', settings: 'Workspace settings' };

export function WorkspacePage({ view }: { view: View }) {
  const [token, setToken] = useState(() => sessionStorage.getItem('ofs-workspace-key') ?? '');
  const [keyInput, setKeyInput] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [provider, setProvider] = useState('ollama');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<{ id: string; title: string; provider: string }[]>([]);
  const [includeRecords, setIncludeRecords] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>(['src/client/components/sidebar.tsx']);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [proposals, setProposals] = useState<{ id: string; request: string }[]>([]);
  async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch('/api/workspace' + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Request failed');
    return data;
  }
  async function load() {
    try {
      const status = await request<{ providers: Provider[] }>('/status');
      setProviders(status.providers);
      setProvider(current => status.providers.find(item => item.id === current && item.configured)?.id ?? status.providers.find(item => item.configured)?.id ?? 'ollama');
      setUnlocked(true); setError('');
      sessionStorage.setItem('ofs-workspace-key', token);
      const [chat, docs, sources, changes] = await Promise.all([
        request<{ conversations: typeof conversations }>('/conversations'), request<{ documents: Document[] }>('/knowledge'),
        request<{ files: string[] }>('/builder/files'), request<{ proposals: typeof proposals }>('/builder/proposals'),
      ]);
      setConversations(chat.conversations); setDocuments(docs.documents); setFiles(sources.files); setProposals(changes.proposals);
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { if (token) void load(); }, [token]);
  async function action(fn: () => Promise<void>) {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const configured = providers.some(item => item.id === provider && item.configured);
  const selector = <label class="workspace-provider">AI connection
    <select aria-label="AI connection" value={provider} disabled={busy || (view === 'chat' && Boolean(conversationId))} onChange={e => setProvider(e.currentTarget.value)}>
      {providers.map(item => <option value={item.id} disabled={!item.configured}>{item.label}{item.model ? ` · ${item.model}` : ' · Not configured'}</option>)}
    </select>
  </label>;
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(proposal, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `openfieldservice-change-${proposal!.id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div class="page workspace-page">
    <div class="page-header"><h1>{titles[view]}</h1>{unlocked && <button class="btn btn-ghost" onClick={() => { sessionStorage.removeItem('ofs-workspace-key'); setToken(''); setUnlocked(false); setMessages([]); setDocuments([]); setProposal(null); }}>Lock workspace</button>}</div>
    {error && <div class="workspace-error" role="alert">{error}</div>}
    {!unlocked ? <section class="workspace-access">
      <h2>Open your workspace</h2><p>Enter the access key configured for this server. Your key stays in this browser tab.</p>
      <form onSubmit={e => { e.preventDefault(); if (keyInput === token) void load(); else setToken(keyInput); }}>
        <label class="form-group">Workspace access key<input type="password" autoComplete="off" value={keyInput} onInput={e => setKeyInput(e.currentTarget.value)} required /></label>
        <button class="btn btn-primary" type="submit">Unlock</button>
      </form>
      <p class="text-muted">First setup: configure WORKSPACE_TOKEN and an AI connection on the server. See deploy/WORKSPACE.md in your checkout.</p>
    </section> : <>
      {view === 'chat' && <div class="workspace-columns">
        <aside class="workspace-list" aria-label="Conversations"><button class="btn" disabled={busy} onClick={() => { setConversationId(null); setMessages([]); }}>New chat</button>
          {conversations.map(item => <button class={`workspace-list-item ${conversationId === item.id ? 'active' : ''}`} disabled={busy} onClick={() => void action(async () => {
            const data = await request<{ conversation: { provider: string }; messages: Message[] }>('/conversations/' + item.id);
            setConversationId(item.id); setProvider(data.conversation.provider); setMessages(data.messages);
          })}>{item.title}</button>)}
        </aside>
        <section class="workspace-chat">
          {selector}
          {!configured && <p class="workspace-help">Connect Ollama, OpenAI or DeepSeek in your server configuration to start chatting.</p>}
          <div class="workspace-messages" aria-live="polite" aria-busy={busy}>
            {!messages.length && <div class="workspace-empty"><h2>Your service assistant</h2><p>Ask about your equipment, service work, or saved knowledge. Use App builder for changes to the application.</p></div>}
            {messages.map((item, index) => <article key={index} class={`workspace-message ${item.role}`}><strong>{item.role === 'user' ? 'You' : 'Assistant'}</strong><div>{item.content}</div></article>)}
            {busy && <p role="status">Preparing a reply…</p>}
          </div>
          <form class="workspace-composer" onSubmit={e => { e.preventDefault(); void action(async () => {
            const sent = prompt;
            const data = await request<{ conversationId: string; reply: string }>('/chat', 'POST', { provider, message: sent, conversationId, includeRecords });
            setConversationId(data.conversationId); setMessages(current => [...current, { role: 'user', content: sent }, { role: 'assistant', content: data.reply }]); setPrompt('');
            setConversations((await request<{ conversations: typeof conversations }>('/conversations')).conversations);
          }); }}>
            <label class="workspace-consent"><input type="checkbox" checked={includeRecords} disabled={busy} onChange={e => setIncludeRecords(e.currentTarget.checked)} /> Include a limited snapshot of customers, buildings, equipment and jobs</label>
            <p class="workspace-help">Messages and saved knowledge are sent to the selected AI connection. Record details are included only when checked.</p>
            <label class="form-group">Message<textarea value={prompt} maxLength={8000} rows={3} disabled={busy} onInput={e => setPrompt(e.currentTarget.value)} required /></label>
            <button class="btn btn-primary" disabled={busy || !configured || !prompt.trim()}>Send message</button>
          </form>
        </section>
      </div>}
      {view === 'knowledge' && <div class="workspace-columns">
        <aside class="workspace-list" aria-label="Knowledge documents"><button class="btn" onClick={() => { setDocumentId(null); setTitle(''); setContent(''); }}>New document</button>
          {documents.map(item => <button class={`workspace-list-item ${documentId === item.id ? 'active' : ''}`} onClick={() => { setDocumentId(item.id); setTitle(item.title); setContent(item.content); }}>{item.title}</button>)}
        </aside>
        <form class="workspace-editor" onSubmit={e => { e.preventDefault(); void action(async () => {
          const result = await request<{ id: string }>('/knowledge', 'POST', { id: documentId ?? undefined, title, content }); setDocumentId(result.id);
          setDocuments((await request<{ documents: Document[] }>('/knowledge')).documents);
        }); }}>
          <h2>{documentId ? 'Edit document' : 'Add to your knowledge'}</h2><p class="workspace-help">Save service procedures, controls notes and handover references as text. The assistant uses up to ten recently updated documents.</p>
          <label class="form-group">Title<input value={title} maxLength={200} onInput={e => setTitle(e.currentTarget.value)} required /></label>
          <label class="form-group">Document text<textarea rows={18} value={content} maxLength={30000} onInput={e => setContent(e.currentTarget.value)} required /></label>
          <div class="workspace-actions"><button class="btn btn-primary" disabled={busy}>Save document</button>
            {documentId && <button class="btn" type="button" disabled={busy} onClick={() => void action(async () => { await request('/knowledge/' + documentId + '/archive', 'POST'); setDocumentId(null); setTitle(''); setContent(''); setDocuments((await request<{ documents: Document[] }>('/knowledge')).documents); })}>Archive document</button>}
          </div>
        </form>
      </div>}
      {view === 'builder' && <section class="workspace-editor">
        <h2>Prepare an application change</h2><p class="workspace-help">Describe a frontend change and select its files. Review the generated replacements, then download the proposal to validate and rebuild on the server. This does not change your live application automatically.</p>
        <form onSubmit={e => { e.preventDefault(); void action(async () => {
          setProposal(await request<Proposal>('/builder/proposals', 'POST', { provider, message: prompt, files: selectedFiles }));
          setProposals((await request<{ proposals: typeof proposals }>('/builder/proposals')).proposals);
        }); }}>
          {selector}
          <label class="form-group">Files to change (choose up to four)<select multiple size={8} onChange={e => setSelectedFiles(Array.from(e.currentTarget.selectedOptions).map(option => option.value))}>{files.map(file => <option value={file} selected={selectedFiles.includes(file)}>{file}</option>)}</select></label>
          <label class="form-group">Describe the change<textarea rows={4} maxLength={8000} value={prompt} onInput={e => setPrompt(e.currentTarget.value)} required /></label>
          <button class="btn btn-primary" disabled={busy || !configured || !selectedFiles.length || selectedFiles.length > 4}>{busy ? 'Preparing…' : 'Prepare change'}</button>
        </form>
        {proposal && <section class="workspace-proposal"><h2>Review proposed changes</h2><p>{proposal.summary}</p>
          {proposal.files.map(file => <details><summary>{file.path}</summary><div class="workspace-diff"><div><h3>Current</h3><pre>{file.before}</pre></div><div><h3>Proposed</h3><pre>{file.content}</pre></div></div></details>)}
          <button class="btn" onClick={download}>Download proposal</button><p class="workspace-help">After reviewing, use pnpm builder:apply /path/to/proposal.json from a clean deployment checkout as a non-root deployment user.</p>
        </section>}
        {!!proposals.length && <section class="workspace-proposal"><h2>Previous proposals</h2>{proposals.map(item => <button class="workspace-list-item" onClick={() => void action(async () => setProposal(await request<Proposal>('/builder/proposals/' + item.id)))}>{item.request}</button>)}</section>}
      </section>}
      {(view === 'integrations' || view === 'settings') && <section class="workspace-editor">
        <h2>AI connections</h2><p class="workspace-help">All connections are optional. Choose a connection for each new chat or app change.</p>
        <div class="workspace-connections">{providers.map(item => <div class="workspace-connection"><div><strong>{item.label}</strong><p>{item.model || 'No model configured'}</p></div><span class={`badge ${item.configured ? 'badge-success' : 'badge-muted'}`}>{item.configured ? 'Configured' : 'Not configured'}</span></div>)}</div>
        <p class="workspace-help">Connection settings and secrets are managed in /etc/openfieldservice.env. Restart the service after changes. Configured means settings are present; the first request verifies the connection.</p>
        <h2>Accounting</h2><p>QuickBooks Online and Desktop connectors are planned. No accounting connection is active.</p>
        {view === 'settings' && <><h2>Workspace access</h2><p>The access key protects Chat, Knowledge and App builder. The original field-service pages still require network access controls or an authenticated reverse proxy.</p><p>Chat history, knowledge and proposals are saved in workspace.sqlite beside the service database.</p></>}
      </section>}
    </>}
  </div>;
}
