import { useEffect, useRef, useState } from 'preact/hooks';
import { Search, X, Plug, ArrowUpRight } from 'lucide-preact';
import { integrationCatalog, type Integration } from '../integrations-catalog';
import { integrationLogos } from '../integration-logos';
import { isAdministrator, useAccount } from '../auth';
import { ProviderSettings } from './account-pages';

type Provider = { id: string; configured: boolean };
const categories = ['All services', 'Google', 'Microsoft', 'CRM', 'Social media', 'AI', 'Accounting', 'Other'];
const ai = new Set(['ollama', 'openai', 'deepseek']);
function Logo({ item }: { item: Integration }) {
  return integrationLogos.has(item.id)
    ? <img class="integration-logo" src={`/integrations/${item.id}.svg`} alt="" loading="lazy" width="36" height="36" />
    : <span class={`integration-monogram integration-color-${item.name.charCodeAt(0) % 6}`} aria-hidden="true">{item.name.split(/\s+/).slice(0, 2).map(word => word[0]).join('')}</span>;
}
export function IntegrationsPage({ providers, refresh }: { providers: Provider[]; refresh(): Promise<void> }) {
  const { user } = useAccount();
  const [query, setQuery] = useState(''); const [category, setCategory] = useState('All services');
  const [selected, setSelected] = useState<Integration | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const canManage = isAdministrator(user);
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered = integrationCatalog.filter(item => (category === 'All services' || item.categories.includes(category)) && words.every(word => `${item.name} ${item.description} ${item.categories.join(' ')}`.toLocaleLowerCase().includes(word)));
  useEffect(() => { if (selected) dialog.current?.showModal(); }, [selected]);
  function close() { dialog.current?.close(); setSelected(null); void refresh(); }
  return <div class="integration-catalog">
    <p class="integration-intro">Browse {integrationCatalog.length} services for your workspace. Open a service to see its availability and connection options.</p>
    <div class="integration-toolbar"><label class="integration-search"><Search size={18} aria-hidden="true" /><input aria-label="Search integrations" type="search" placeholder="Search integrations…" value={query} onInput={e => setQuery(e.currentTarget.value)} />{query && <button class="btn-icon" aria-label="Clear search" onClick={() => setQuery('')}><X size={16} /></button>}</label></div>
    <div class="integration-filters" role="group" aria-label="Integration categories">{categories.map(name => <button class={`integration-filter ${category === name ? 'active' : ''}`} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}</div>
    <p class="integration-result-count" role="status">{filtered.length} {filtered.length === 1 ? 'service' : 'services'}{category !== 'All services' ? ` in ${category}` : ''}</p>
    <div class="integration-grid">{filtered.map(item => <button key={item.id} class="integration-card" onClick={() => setSelected(item)} aria-haspopup="dialog">
      <Logo item={item} /><span class="integration-card-copy"><span class="integration-name">{item.name}</span><span class="integration-description">{item.description}</span>{ai.has(item.id) && <span class="integration-availability">{providers.some(provider => provider.id === item.id && provider.configured) ? 'Configured' : 'Setup available'}</span>}</span>
    </button>)}</div>
    {!filtered.length && <div class="workspace-empty"><Plug size={28} /><h2>No matching integrations</h2><p>Try another service name or category.</p><button class="btn" onClick={() => { setQuery(''); setCategory('All services'); }}>Show all services</button></div>}
    <dialog ref={dialog} class="integration-dialog" aria-labelledby="integration-dialog-title" onCancel={() => { setSelected(null); void refresh(); }} onClick={e => { if (e.target === dialog.current) { const bounds = dialog.current!.getBoundingClientRect(); if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) close(); } }}>
      {selected && <><div class="integration-dialog-heading"><Logo item={selected} /><div><h2 id="integration-dialog-title">{selected.name}</h2><p>{selected.categories.join(' · ')}</p></div><button class="btn-icon" onClick={close} aria-label="Close integration details" autoFocus><X size={20} /></button></div>
        <p class="integration-dialog-description">{selected.description}</p>
        {ai.has(selected.id) ? <><p class="integration-notice">{providers.some(provider => provider.id === selected.id && provider.configured) ? 'Settings are configured. Send a message in Chat to verify the connection.' : 'This connector is available. Configure your server address or API account below.'}</p>{canManage ? <ProviderSettings providerId={selected.id} /> : <p>Your administrator manages this connection.</p>}<a class="btn" href="/chat">Open Chat <ArrowUpRight size={14} /></a></> : <div class="integration-notice"><strong>Connector not yet implemented</strong><p>This service is in your catalog. Connecting accounts and using its data from Chat or apps requires a dedicated connector. No account has been connected and no data is being synchronized.</p></div>}
      </>}
    </dialog>
  </div>;
}
