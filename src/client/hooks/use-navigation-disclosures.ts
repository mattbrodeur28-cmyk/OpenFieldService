import { useEffect, useState } from 'preact/hooks';

const defaults: Record<string, boolean> = { fieldService: true, sales: true, fleet: true, finance: true };
function read(key: string): Record<string, boolean> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) || 'null');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {...defaults};
    return Object.fromEntries(Object.entries(defaults).map(([name, fallback]) => [name, typeof (saved as Record<string, unknown>)[name] === 'boolean' ? (saved as Record<string, boolean>)[name] : fallback]));
  } catch { return {...defaults}; }
}

/** Local presentation preferences only; storage is never an authorization source. */
export function useNavigationDisclosures(userId: string) {
  const key = `ofs:navigation:v1:${userId}`;
  const [state, setState] = useState(() => ({key, values: read(key)}));
  const values = state.key === key ? state.values : read(key);
  useEffect(() => {
    setState({key, values:read(key)});
    const sync = (event: StorageEvent) => { if (event.key === key || event.key === null) setState({key, values:read(key)}); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [key]);
  function toggle(name: string) {
    if (!(name in defaults)) return;
    const next = {...values, [name]: !values[name]};
    setState({key, values:next});
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Navigation still works if storage is unavailable. */ }
  }
  return {expanded:values, toggle};
}
