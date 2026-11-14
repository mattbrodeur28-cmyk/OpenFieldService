import { useEffect, useState } from 'preact/hooks';
import { accountRequest, useAccount, isAdministrator } from '../auth';
import type { Connector } from './connector-panel';
import { IntegrationsPage } from './integrations-page';
import { BuilderPage } from './builder-page';
import type { View } from '../types';

type Provider = { id: string; label: string; model: string; configured: boolean };
type Document = { id: string; title: string; content: string };
type Message = { role: string; content: string };
const titles: Record<string, string> = { chat: 'Chat', knowledge: 'Knowledge', integrations: 'Integrations', builder: 'App builder', settings: 'Workspace settings' };

export function WorkspacePage({ view }: { view: View }) {
  const { user } = useAccount();
  const canManage = isAdministrator(user);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [provider, setProvider] = useState('ollama');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<{ id: string; title: string; provider: string }[]>([]);
  const [includeRecords, setIncludeRecords] = useState(false);
  const [integrationSources, setIntegrationSources] = useState<Connector[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  useEffect(() => { setSelectedSources([]); void accountRequest<{ connectors: Connector[] }>('/api/integrations').then(result => setIntegrationSources(result.connectors.filter(item => item.connected))).catch(() => setIntegrationSources([])); }, [user.id, view]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    return accountRequest<T>('/api/workspace' + path, method, body);
  }
  async function load() {
    try {
      const status = await request<{ providers: Provider[] }>('/status');
      setProviders(status.providers);
      setProvider(current => status.providers.find(item => item.id === current && item.configured)?.id ?? status.providers.find(item => item.configured)?.id ?? 'ollama');
      setError('');
      const [chat, docs] = await Promise.all([
        request<{ conversations: typeof conversations }>('/conversations'), request<{ documents: Document[] }>('/knowledge'),
      ]);
      setConversations(chat.conversations); setDocuments(docs.documents);
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void load(); setPrompt(''); if (view !== 'chat') { setConversationId(null); setMessages([]); } }, [user.id, view]);
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
  return <div class="page workspace-page">
    <div class="page-header"><h1>{titles[view]}</h1></div>
    {error && <div class="workspace-error" role="alert">{error}</div>}
    <>
      {view === 'chat' && <div class="workspace-columns">
        <aside class="workspace-list" aria-label="Conversations"><button class="btn" disabled={busy} onClick={() => { setConversationId(null); setMessages([]); setIncludeRecords(false); setSelectedSources([]); }}>New chat</button>
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
            const data = await request<{ conversationId: string; reply: string }>('/chat', 'POST', { provider, message: sent, conversationId, includeRecords, integrations: selectedSources.map(value => { const [provider, action] = value.split(':'); return { provider, action }; }) });
            setConversationId(data.conversationId); setMessages(current => [...current, { role: 'user', content: sent }, { role: 'assistant', content: data.reply }]); setPrompt('');
            setConversations((await request<{ conversations: typeof conversations }>('/conversations')).conversations);
          }); }}>
            <label class="workspace-consent"><input type="checkbox" checked={includeRecords} disabled={busy} onChange={e => setIncludeRecords(e.currentTarget.checked)} /> Include a limited snapshot of customers, buildings, equipment and jobs</label>
            {!!integrationSources.length && user.role !== 'viewer' && <label class="form-group">Include live integration data (optional, choose up to three)
              <select multiple size={5} disabled={busy} onChange={e => setSelectedSources(Array.from(e.currentTarget.selectedOptions).map(option => option.value).slice(0, 3))}>
                {integrationSources.flatMap(item => item.actions.map(action => <option value={item.id + ':' + action} selected={selectedSources.includes(item.id + ':' + action)}>{item.name} · {action}</option>))}
              </select><span class="workspace-help">Selected data is read from your connected account and sent to this chat's AI provider. Earlier conversation replies may retain previously shared details. Clear the selection to stop fetching new data.</span>
            </label>}
            <p class="workspace-help">Messages and saved knowledge are sent to the selected AI connection. Record details are included only when checked.</p>
            <label class="form-group">Message<textarea value={prompt} maxLength={8000} rows={3} disabled={busy} onInput={e => setPrompt(e.currentTarget.value)} required /></label>
            <button class="btn btn-primary" disabled={busy || !configured || !prompt.trim()}>Send message</button>
          </form>
        </section>
      </div>}
      {view === 'knowledge' && <div class="workspace-columns">
        <aside class="workspace-list" aria-label="Knowledge documents"><button class="btn" disabled={user.role === 'viewer'} onClick={() => { setDocumentId(null); setTitle(''); setContent(''); }}>New document</button>
          {documents.map(item => <button class={`workspace-list-item ${documentId === item.id ? 'active' : ''}`} onClick={() => { setDocumentId(item.id); setTitle(item.title); setContent(item.content); }}>{item.title}</button>)}
        </aside>
        <form class="workspace-editor" onSubmit={e => { e.preventDefault(); void action(async () => {
          const result = await request<{ id: string }>('/knowledge', 'POST', { id: documentId ?? undefined, title, content }); setDocumentId(result.id);
          setDocuments((await request<{ documents: Document[] }>('/knowledge')).documents);
        }); }}>
          <h2>{documentId ? 'Edit document' : 'Add to your knowledge'}</h2><p class="workspace-help">Save service procedures, controls notes and handover references as text. The assistant uses up to ten recently updated documents.</p>
          <label class="form-group">Title<input value={title} maxLength={200} onInput={e => setTitle(e.currentTarget.value)} required /></label>
          <label class="form-group">Document text<textarea rows={18} value={content} maxLength={30000} onInput={e => setContent(e.currentTarget.value)} required /></label>
          <div class="workspace-actions"><button class="btn btn-primary" disabled={busy || user.role === 'viewer'}>Save document</button>
            {documentId && user.role !== 'viewer' && <button class="btn" type="button" disabled={busy} onClick={() => void action(async () => { await request('/knowledge/' + documentId + '/archive', 'POST'); setDocumentId(null); setTitle(''); setContent(''); setDocuments((await request<{ documents: Document[] }>('/knowledge')).documents); })}>Archive document</button>}
          </div>
        </form>
      </div>}
      {view === 'builder' && canManage && <BuilderPage />}
      {view === 'integrations' && <IntegrationsPage providers={providers} refresh={load} />}
    </>
  </div>;
}
