import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { clearSavedFieldData } from './offline';

export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';
export interface AccountUser { id: string; name: string; email: string; role: UserRole; active: boolean; hr?: boolean; mustChangePassword: boolean }
export interface Team { id: string; name: string; description: string; member_count: number }
export async function accountRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'OpenFieldService' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 401) window.dispatchEvent(new Event('ofs:auth-required'));
  let data;
  try { data = await response.json(); } catch { throw new Error(`The server returned an unexpected response (HTTP ${response.status}). Reload the page; if it continues, check that the application and proxy are running the same release.`); }
  if (!response.ok) throw new Error(data.error || 'The request failed.');
  return data;
}
interface AuthState { user: AccountUser; teams: Team[]; refreshTeams(): Promise<void>; refreshAccount(): Promise<void>; logout(): Promise<void> }
const AuthContext = createContext<AuthState | null>(null);
export function useAccount() { const context = useContext(AuthContext); if (!context) throw new Error('Account context missing'); return context; }
export const isAdministrator = (user: AccountUser) => ['owner', 'admin'].includes(user.role);

export const canManagePeople = (user: AccountUser) => isAdministrator(user) || (user.hr === true && user.role === 'member');

export function AuthGate({ children }: { children: ComponentChildren }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState(false);
  const [canBootstrap, setCanBootstrap] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function refreshTeams() {
    setTeams((await accountRequest<{ teams: Team[] }>('/api/auth/teams')).teams);
  }
  async function refresh() {
    try {
      const result = await accountRequest<{ user: AccountUser | null; setupRequired: boolean; canBootstrap: boolean }>('/api/auth/session');
      setUser(result.user); setSetup(result.setupRequired); setCanBootstrap(result.canBootstrap);
      if (result.user) {
        sessionStorage.setItem('ofs-last-user', JSON.stringify(result.user));
        if (!result.user.mustChangePassword) await refreshTeams();
      } else { sessionStorage.removeItem('ofs-last-user'); setTeams([]); }
    } catch {
      const saved = sessionStorage.getItem('ofs-last-user');
      if (!navigator.onLine && saved) { try { setUser(JSON.parse(saved)); } catch { setError('Sign in while online to open this workspace.'); } }
      else setError('Unable to reach the server. Reconnect and reload the page.');
    } finally { setLoading(false); }
  }
  useEffect(() => {
    void refresh();
    const expired = () => { setUser(null); setTeams([]); sessionStorage.removeItem('ofs-last-user'); void clearSavedFieldData(); };
    const online = () => { void refresh(); };
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ofs-account') : null;
    if (channel) channel.onmessage = () => { expired(); void refresh(); };
    window.addEventListener('ofs:auth-required', expired);
    window.addEventListener('online', online);
    return () => { window.removeEventListener('ofs:auth-required', expired); window.removeEventListener('online', online); channel?.close(); };
  }, []);
  function announceAccountChange() {
    if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel('ofs-account'); channel.postMessage('changed'); channel.close(); }
  }
  async function logout() {
    await accountRequest('/api/auth/logout', 'POST');
    await clearSavedFieldData();
    sessionStorage.removeItem('ofs-last-user'); sessionStorage.removeItem('ofs-workspace-key');
    setUser(null); setTeams([]); announceAccountChange();
  }
  if (loading) return <div class="auth-screen"><p role="status">Opening your workspace…</p></div>;
  if (!user || user.mustChangePassword) return <div class="auth-screen"><section class="auth-card">
    <div class="auth-brand"><span>F</span> Field Service</div>
    <h1>{user?.mustChangePassword ? 'Choose your own password' : setup ? 'Create the workspace owner' : 'Welcome back'}</h1>
    <p>{user?.mustChangePassword ? 'Replace your temporary password before opening the workspace.' : setup ? 'Use your existing workspace key to secure this installation with an owner account.' : 'Sign in to your company workspace.'}</p>
    {error && <div class="workspace-error" role="alert">{error}</div>}
    <form onSubmit={e => { e.preventDefault(); setBusy(true); setError(''); void (async () => {
      try {
        if (user?.mustChangePassword) await accountRequest('/api/auth/password', 'POST', { currentPassword, password });
        else if (setup) await accountRequest('/api/auth/setup', 'POST', { name, email, password, bootstrapToken });
        else await accountRequest('/api/auth/login', 'POST', { email, password });
        await clearSavedFieldData(); setPassword(''); setCurrentPassword(''); setBootstrapToken(''); announceAccountChange(); await refresh();
      } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    })(); }}>
      {setup && !user && <><label class="form-group">Name<input value={name} maxLength={100} onInput={e => setName(e.currentTarget.value)} autoComplete="name" required /></label>
        <label class="form-group">Existing workspace key<input type="password" value={bootstrapToken} onInput={e => setBootstrapToken(e.currentTarget.value)} autoComplete="off" required /></label></>}
      {!user && <label class="form-group">Email<input type="email" value={email} onInput={e => setEmail(e.currentTarget.value)} autoComplete="username" required /></label>}
      {user?.mustChangePassword && <label class="form-group">Temporary password<input type="password" value={currentPassword} onInput={e => setCurrentPassword(e.currentTarget.value)} autoComplete="current-password" required /></label>}
      <label class="form-group">{user?.mustChangePassword || setup ? 'New password' : 'Password'}<input type="password" value={password} minLength={user?.mustChangePassword || setup ? 12 : undefined} maxLength={128} onInput={e => setPassword(e.currentTarget.value)} autoComplete={user?.mustChangePassword || setup ? 'new-password' : 'current-password'} required /></label>
      <button class="btn btn-primary" disabled={busy || (setup && !canBootstrap)}>{busy ? 'Please wait…' : user?.mustChangePassword ? 'Save password' : setup ? 'Create owner account' : 'Sign in'}</button>
    </form>
    {setup && !canBootstrap && <p>Configure WORKSPACE_TOKEN on the server before creating the first owner.</p>}
    {!setup && !user && <p class="workspace-help">Your administrator creates accounts and resets forgotten passwords.</p>}
  </section></div>;
  return <AuthContext.Provider key={user.id} value={{ user, teams, refreshTeams, refreshAccount: refresh, logout }}>{children}</AuthContext.Provider>;
}
