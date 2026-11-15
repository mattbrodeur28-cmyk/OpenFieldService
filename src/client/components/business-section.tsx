import { businessModules } from '../business-modules';
import { ModuleOverview } from './module-overview';
import type { View } from '../types';
import { useApp } from '../context';
import { canManagePeople, isAdministrator, useAccount } from '../auth';
import { AccountPages } from './account-pages';
import { InvoiceList } from './invoice-list';
import { InvoiceDetail } from './invoice-detail';
import { PurchasingPage } from './purchasing-page';
import './business-section.css';

const planned: Record<string, { title: string; description: string; scope: string }> = {
  onboarding: { title: 'Onboarding', description: 'Employee onboarding workflows are planned.', scope: 'Checklists, assigned tasks, start dates, acknowledgments, and completion history will connect to the staff record.' },
  documents: { title: 'HR documents', description: 'Private employee document storage is planned.', scope: 'Personnel files, certifications, expiration reminders, and acknowledgments require HR-specific access controls.' },
  receivables: { title: 'Receivables', description: 'Aging and collections workflows are planned.', scope: 'Balances will come from issued invoices, payments, and credits. Open Invoices to use the existing billing workflow.' },
  liabilities: { title: 'Liabilities', description: 'Supplier bills and payable balances are planned.', scope: 'Bills, credits, due dates, and payment reconciliation will link to suppliers, purchase orders, and QuickBooks. A purchase order is a commitment, not a posted payable.' },
};

export function BusinessSection({ view, id, invoiceDetail = false }: { view: View; id: string | null; invoiceDetail?: boolean }) {
  const { user } = useAccount();
  const { navigate } = useApp();
  const hr = view === 'hr';
  // Existing invoice routes retain their existing read permissions. HR never grants finance access.
  const allowed = hr ? canManagePeople(user) : view === 'invoices' || isAdministrator(user);
  if (!allowed) return <div class="page"><h1>{hr ? 'HR' : 'Finance'}</h1><p>You do not have access to this section.</p></div>;
  const module = hr ? businessModules.hr : businessModules.finance;
  const pages = module.pages;
  const requested = ['purchasing', 'invoices'].includes(view) ? view : id;
  const section = pages.some(page => page.key === requested) ? requested! : 'overview';
  const availablePages = !hr && !isAdministrator(user) ? pages.filter(page => page.key === 'invoices') : pages;
  const info = planned[section];
  return <section class="business-section" aria-label={hr ? 'HR' : 'Finance'}>
    <header class="business-section-header"><strong>{hr ? 'HR' : 'Finance'}</strong>
      <nav aria-label={hr ? 'HR pages' : 'Finance pages'}><button type="button" class={section==='overview'?'active':''} onClick={()=>navigate('/'+module.view)}>Overview</button>{availablePages.map(page => <button type="button" key={page.key} class={section === page.key ? 'active' : ''} aria-current={section === page.key ? 'page' : undefined} onClick={() => navigate(page.path)}>{page.label}</button>)}</nav>
    </header>
    {section === 'overview' && <ModuleOverview module={{...module,pages:availablePages}}/>}
    {hr && section === 'staff' && <AccountPages view="users" id={null} title="Staff" />}
    {!hr && section === 'invoices' && (invoiceDetail ? <InvoiceDetail /> : <InvoiceList />)}
    {!hr && section === 'purchasing' && <PurchasingPage orderId={view === 'purchasing' ? id : null} />}
    {info && <div class="page"><div class="page-header"><h1>{info.title}</h1><span class="badge badge-muted">Planned</span></div><section class="workspace-editor"><h2>{info.description}</h2><p>{info.scope}</p>{section === 'receivables' && <button type="button" class="btn" onClick={() => navigate('/invoices')}>Open invoices</button>}</section></div>}
  </section>;
}
