import { useEffect, useState } from 'preact/hooks';
import { accountRequest, useAccount, isAdministrator, canManagePeople } from '../auth';
import type { AccountUser, UserRole } from '../auth';
import type { View } from '../types';

interface Configuration { values: Record<string, string>; secrets: Record<string, boolean> }
export function ProviderSettings({ providerId }: { providerId?: string } = {}) {
  const [config, setConfig] = useState<Configuration>({ values: {}, secrets: {} });
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function load() { const result = await accountRequest<Configuration>('/api/workspace/configuration'); setConfig(result); setValues(Object.fromEntries(Object.entries(result.values).filter(([name]) => !name.startsWith('COMPANY_')))); }
  useEffect(() => { void load().catch(e => setError(e.message)); }, []);
  const fields = [
    { id: 'ollama', title: 'Local Ollama', names: ['OLLAMA_BASE_URL', 'OLLAMA_MODEL'] },
    { id: 'deepseek', title: 'DeepSeek', names: ['DEEPSEEK_MODEL', 'DEEPSEEK_API_KEY'] },
    { id: 'openai', title: 'OpenAI', names: ['OPENAI_MODEL', 'OPENAI_API_KEY'] },
  ].filter(group => !providerId || group.id === providerId);
  return <section class="workspace-editor"><h2>{providerId ? 'Connection settings' : 'AI connections'}</h2><p class="workspace-help">Settings saved here take effect immediately. API keys are stored encrypted and never returned to the browser. An empty key field leaves the current key unchanged.</p>
    {error && <div class="workspace-error" role="alert">{error}</div>}{message && <p role="status">{message}</p>}
    <form onSubmit={e => { e.preventDefault(); setBusy(true); setError(''); setMessage(''); void accountRequest('/api/workspace/configuration', 'PUT', { values }).then(async () => { await load(); setMessage('Connections saved. Start a new chat to use a different provider.'); }).catch(e => setError(e.message)).finally(() => setBusy(false)); }}>
      {fields.map(group => <fieldset class="account-fieldset"><legend>{group.title}</legend>{group.names.map(name => <label class="form-group">{name}
        <input type={name.endsWith('_KEY') ? 'password' : 'text'} value={values[name] || ''} autoComplete="off" placeholder={config.secrets[name] ? 'A key is already configured' : ''} onInput={e => setValues(current => ({ ...current, [name]: e.currentTarget.value }))} />
      </label>)}</fieldset>)}
      <button class="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save connections'}</button>
    </form>
  </section>;
}

function UserRow({ item, refresh }: { item: AccountUser; refresh(): Promise<void> }) {
  const { user } = useAccount(); const [name, setName] = useState(item.name); const [role, setRole] = useState(item.role); const [active, setActive] = useState(item.active); const [hr, setHr] = useState(Boolean(item.hr));
  const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const protectedUser = item.role === 'owner' || item.id === user.id || (item.role === 'admin' && user.role !== 'owner') || (item.hr && !isAdministrator(user));
  return <article class="account-user"><div class="account-user-heading"><span class="account-avatar">{item.name.slice(0, 1).toUpperCase()}</span><div><strong>{item.name}</strong><p>{item.email}</p></div><span class="badge badge-muted">{item.role}</span>{!item.active && <span class="badge badge-warning">Inactive</span>}</div>
    {!protectedUser && <details><summary>Manage account</summary>{error && <div class="workspace-error" role="alert">{error}</div>}
      <form class="account-inline-form" onSubmit={e => { e.preventDefault(); setBusy(true); setError(''); void accountRequest('/api/auth/users/' + item.id, 'PUT', { name, role, active, hr: role === 'member' && hr }).then(refresh).catch(e => setError(e.message)).finally(() => setBusy(false)); }}>
        <label class="form-group">Name<input value={name} onInput={e => setName(e.currentTarget.value)} required maxLength={100} /></label>
        <label class="form-group">Role<select value={role} onChange={e => setRole(e.currentTarget.value as UserRole)}>{user.role === 'owner' && <option value="admin">Admin</option>}<option value="member">Member</option><option value="viewer">Viewer</option></select></label>
        {isAdministrator(user) && role === 'member' && <label class="workspace-consent"><input type="checkbox" checked={hr} onChange={e => setHr(e.currentTarget.checked)} /> HR / people administration</label>}
        <label class="workspace-consent"><input type="checkbox" checked={active} onChange={e => setActive(e.currentTarget.checked)} /> Active</label><button class="btn" disabled={busy}>Save account</button>
      </form>
      <form class="account-inline-form" onSubmit={e => { e.preventDefault(); setBusy(true); setError(''); void accountRequest('/api/auth/users/' + item.id + '/reset-password', 'POST', { password }).then(() => { setPassword(''); return refresh(); }).catch(e => setError(e.message)).finally(() => setBusy(false)); }}>
        <label class="form-group">New temporary password<input type="password" value={password} onInput={e => setPassword(e.currentTarget.value)} minLength={12} maxLength={128} autoComplete="new-password" required /></label><button class="btn" disabled={busy}>Reset temporary password</button>
      </form>
    </details>}
  </article>;
}

export function AccountPages({ view, id, title: heading }: { view: View; id: string | null; title?: string }) {
  const { user, teams, refreshTeams } = useAccount(); const canManage = isAdministrator(user); const managePeople = canManagePeople(user);
  const [users, setUsers] = useState<AccountUser[]>([]); const [members, setMembers] = useState<AccountUser[]>([]); const [selected, setSelected] = useState<string[]>([]);
  const [team, setTeam] = useState<{ name: string; description: string } | null>(null); const [messages, setMessages] = useState<{ id: string; author: string; content: string; created_at: string }[]>([]);
  const [values, setValues] = useState<Record<string, string>>({}); const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [currentPassword, setCurrentPassword] = useState('');
  const [role, setRole] = useState('member'); const [description, setDescription] = useState(''); const [chat, setChat] = useState(''); const [error, setError] = useState(''); const [success, setSuccess] = useState(''); const [busy, setBusy] = useState(false);
  async function loadUsers() { setUsers((await accountRequest<{ users: AccountUser[] }>('/api/auth/users')).users); }
  async function loadTeam(updateSelection = true) {
    const result = await accountRequest<{ team: typeof team; members: AccountUser[]; messages: typeof messages }>('/api/auth/teams/' + id);
    setTeam(result.team); setMembers(result.members); setMessages(result.messages); if (updateSelection) setSelected(result.members.map(member => member.id));
  }
  useEffect(() => {
    setError(''); setSuccess(''); setName(''); setDescription('');
    void (async () => {
      try {
        if (view === 'users' && managePeople) await loadUsers();
        if (view === 'team' && id) { await loadTeam(); if (managePeople) await loadUsers(); }
        if (view === 'website' && canManage) setValues((await accountRequest<Configuration>('/api/workspace/configuration')).values);
      } catch (e) { setError((e as Error).message); }
    })();
    if (view !== 'team' || !id) return;
    const timer = setInterval(() => { void loadTeam(false).catch(() => {}); }, 5000);
    return () => clearInterval(timer);
  }, [view, id]);
  async function action(fn: () => Promise<void>) { setBusy(true); setError(''); setSuccess(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  const title = view === 'team' ? team?.name && id ? team.name : 'Teams' : view === 'users' ? 'Users' : view === 'website' ? 'Website' : view === 'environment' ? 'Environment variables' : 'Your account';
  return <div class="page workspace-page"><div class="page-header"><h1>{heading || title}</h1></div>
    {error && <div class="workspace-error" role="alert">{error}</div>}{success && <p class="account-success" role="status">{success}</p>}
    {view === 'users' && (managePeople ? <section class="workspace-editor"><h2>Workspace users</h2><p class="workspace-help">One company workspace. Owners and admins manage access; members manage service work; viewers have read-only service access. User accounts and technician records are separate.</p>
      <div>{users.map(item => <UserRow key={item.id} item={item} refresh={loadUsers} />)}</div>
      <h2 class="account-section-heading">Create a user</h2><form onSubmit={e => { e.preventDefault(); void action(async () => { await accountRequest('/api/auth/users', 'POST', { name, email, password, role }); setName(''); setEmail(''); setPassword(''); await loadUsers(); setSuccess('Account created. Share the temporary password privately; the user must replace it at first sign-in.'); }); }}>
        <label class="form-group">Name<input value={name} onInput={e => setName(e.currentTarget.value)} maxLength={100} required /></label><label class="form-group">Email<input type="email" value={email} onInput={e => setEmail(e.currentTarget.value)} required /></label>
        <label class="form-group">Role<select value={role} onChange={e => setRole(e.currentTarget.value)}>{user.role === 'owner' && <option value="admin">Admin</option>}<option value="member">Member</option><option value="viewer">Viewer</option></select></label>
        <label class="form-group">Temporary password<input type="password" value={password} onInput={e => setPassword(e.currentTarget.value)} minLength={12} maxLength={128} autoComplete="new-password" required /></label><button class="btn btn-primary" disabled={busy}>Create user</button>
      </form>
    </section> : <p>Administrator access is required to manage users.</p>)}
    {view === 'team' && !id && <section class="workspace-editor"><h2>Your teams</h2><div class="account-team-grid">{teams.map(item => <a href={'/team/' + item.id} class="account-team-card"><span class="account-avatar">{item.name.slice(0, 1).toUpperCase()}</span><div><strong>{item.name}</strong><p>{item.member_count} members</p></div></a>)}</div>
      {managePeople && <><h2 class="account-section-heading">Create a team</h2><form onSubmit={e => { e.preventDefault(); void action(async () => { await accountRequest('/api/auth/teams', 'POST', { name, description }); setName(''); setDescription(''); await refreshTeams(); setSuccess('Team created. Open it to add members.'); }); }}>
        <label class="form-group">Team name<input value={name} maxLength={100} onInput={e => setName(e.currentTarget.value)} required /></label><label class="form-group">Description<textarea value={description} maxLength={1000} onInput={e => setDescription(e.currentTarget.value)} /></label><button class="btn btn-primary" disabled={busy}>Create team</button>
      </form></>}
    </section>}
    {view === 'team' && id && team && <div class="workspace-columns"><aside class="workspace-list"><h2>Members</h2>{members.map(member => <div class="account-member"><span class="account-avatar">{member.name.slice(0, 1).toUpperCase()}</span><div>{member.name}<small>{member.active ? member.role : 'Inactive'}</small></div></div>)}
      {canManage && <details><summary>Manage members</summary>{users.filter(item => item.active).map(item => <label class="workspace-consent account-member-choice"><input type="checkbox" checked={selected.includes(item.id)} onChange={e => setSelected(current => e.currentTarget.checked ? [...current, item.id] : current.filter(value => value !== item.id))} />{item.name}</label>)}<button class="btn" disabled={busy} onClick={() => void action(async () => { await accountRequest('/api/auth/teams/' + id + '/members', 'PUT', { userIds: selected }); await loadTeam(); await refreshTeams(); setSuccess('Team members updated.'); })}>Save members</button></details>}
    </aside><section class="workspace-chat"><h2>Team conversation</h2><p class="workspace-help">{team.description || 'Messages stay in your company workspace and are visible to team members and administrators.'}</p><div class="workspace-messages" aria-live="polite">{!messages.length && <p class="text-muted">No messages yet.</p>}{messages.map(item => <article class="workspace-message" key={item.id}><strong>{item.author} · {item.created_at}</strong><div>{item.content}</div></article>)}</div>
      {user.role !== 'viewer' && <form class="workspace-composer" onSubmit={e => { e.preventDefault(); void action(async () => { await accountRequest('/api/auth/teams/' + id + '/messages', 'POST', { content: chat }); setChat(''); await loadTeam(false); }); }}><label class="form-group">Message your team<textarea value={chat} rows={3} maxLength={8000} onInput={e => setChat(e.currentTarget.value)} required /></label><button class="btn btn-primary" disabled={busy}>Send message</button></form>}
    </section></div>}
    {view === 'environment' && (canManage ? <ProviderSettings /> : <p>Administrator access is required to change connection settings.</p>)}
    {view === 'website' && (canManage ? <section class="workspace-editor"><h2>Your company page</h2><p class="workspace-help">Publish a simple company page at /company. Only the information below becomes public when publishing is enabled.</p><form onSubmit={e => { e.preventDefault(); void action(async () => { const company = Object.fromEntries(Object.entries(values).filter(([key]) => key.startsWith('COMPANY_'))); await accountRequest('/api/workspace/configuration', 'PUT', { values: company }); setSuccess('Company page saved.'); }); }}>
      {[['COMPANY_NAME', 'Company name'], ['COMPANY_WEBSITE', 'Website URL'], ['COMPANY_PHONE', 'Public phone']].map(([key, label]) => <label class="form-group">{label}<input value={values[key] || ''} onInput={e => setValues(current => ({ ...current, [key]: e.currentTarget.value }))} /></label>)}
      <label class="form-group">Description<textarea rows={6} maxLength={4000} value={values.COMPANY_DESCRIPTION || ''} onInput={e => setValues(current => ({ ...current, COMPANY_DESCRIPTION: e.currentTarget.value }))} /></label>
      <label class="workspace-consent"><input type="checkbox" checked={values.COMPANY_PUBLIC === 'true'} onChange={e => setValues(current => ({ ...current, COMPANY_PUBLIC: String(e.currentTarget.checked) }))} /> Publish this company page</label><div class="workspace-actions"><button class="btn btn-primary" disabled={busy}>Save company page</button>{values.COMPANY_PUBLIC === 'true' && <a class="btn" href="/company" target="_blank" rel="noopener noreferrer">Open company page</a>}</div>
    </form></section> : <p>Administrator access is required to manage the company page.</p>)}
    {view === 'settings' && <section class="workspace-editor"><h2>{user.name}</h2><p>{user.email} · {user.role}</p><h2 class="account-section-heading">Change password</h2><form onSubmit={e => { e.preventDefault(); void action(async () => { await accountRequest('/api/auth/password', 'POST', { currentPassword, password }); setCurrentPassword(''); setPassword(''); setSuccess('Password changed. Other sessions have been signed out.'); }); }}>
      <label class="form-group">Current password<input type="password" value={currentPassword} onInput={e => setCurrentPassword(e.currentTarget.value)} autoComplete="current-password" required /></label><label class="form-group">New password<input type="password" value={password} onInput={e => setPassword(e.currentTarget.value)} minLength={12} maxLength={128} autoComplete="new-password" required /></label><button class="btn btn-primary" disabled={busy}>Change password</button>
    </form></section>}
  </div>;
}

export function CompanyWebsite() {
  const [company, setCompany] = useState<{ name: string; description: string; website: string; phone: string } | null>(null); const [error, setError] = useState('');
  useEffect(() => { void fetch('/api/public/company').then(async response => { if (!response.ok) throw new Error('This company page is not published.'); setCompany(await response.json()); }).catch(e => setError(e.message)); }, []);
  return <main class="company-site">{error ? <h1>{error}</h1> : !company ? <p>Loading…</p> : <><span class="company-eyebrow">Field Service</span><h1>{company.name}</h1><p class="company-description">{company.description}</p><div class="workspace-actions">{company.phone && <p>{company.phone}</p>}{company.website && /^https?:\/\//.test(company.website) && <a class="btn btn-primary" href={company.website} rel="noopener noreferrer">Visit our website</a>}</div></>}</main>;
}
