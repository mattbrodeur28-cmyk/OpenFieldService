import { useApp } from '../context';
import type { BusinessModule } from '../business-modules';
import './business-section.css';
export function ModuleOverview({ module }: { module: BusinessModule }) {
  const { navigate } = useApp();
  return <div class="page"><div class="page-header"><h1>{module.label}</h1></div><div class="module-overview-grid">{module.pages.map(page => <button type="button" class="module-overview-card" key={page.key} onClick={() => navigate(page.path)}><span class="module-overview-card-title">{page.label}{page.planned && <span class="badge badge-muted">Planned</span>}</span><span>{page.description}</span></button>)}</div></div>;
}
