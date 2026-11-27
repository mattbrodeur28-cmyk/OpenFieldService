import { ReceivablesPage } from "./finance/receivables-page";
import { LedgerPage } from "./finance/ledger-page";
import { businessModules } from '../business-modules';
import { ModuleOverview } from './module-overview';
import type { View } from '../types';
import { useApp } from '../context';
import { isAdministrator, useAccount } from '../auth';
import { InvoiceList } from './invoice-list';
import { InvoiceDetail } from './invoice-detail';
import { PurchasingPage } from './purchasing-page';
import './business-section.css';

const planned: Record<string, { title: string; description: string; scope: string }> = {};

export function BusinessSection({ view, id, invoiceDetail = false }: { view: View; id: string | null; invoiceDetail?: boolean }) {
  const { user } = useAccount();
  const { navigate } = useApp();
  const allowed = view === 'invoices' || isAdministrator(user);
  if (!allowed) return <div class="page"><h1>Ledger</h1><p>You do not have access to this section.</p></div>;
  const module = businessModules.finance;
  const pages = module.pages;
  const requested = ['purchasing', 'invoices'].includes(view) ? view : id;
  const section = pages.some(page => page.key === requested) ? requested! : 'overview';
  const availablePages = !isAdministrator(user) ? pages.filter(page => page.key === 'invoices') : pages;
  const info = planned[section];
  return <section class="business-section" aria-label="Ledger">
    <header class="business-section-header"><strong>Ledger</strong>
      <nav aria-label="Ledger pages"><button type="button" class={section==='overview'?'active':''} onClick={()=>navigate('/finance')}>Overview</button>{availablePages.map(page => <button type="button" key={page.key} class={section === page.key ? 'active' : ''} aria-current={section === page.key ? 'page' : undefined} onClick={() => navigate(page.path)}>{page.label}</button>)}</nav>
    </header>
    {section === 'overview' && <ModuleOverview module={{...module,pages:availablePages}}/>}
    {section === 'ledger' && isAdministrator(user) && <LedgerPage/>}
    {section === 'invoices' && (invoiceDetail ? <InvoiceDetail /> : <InvoiceList />)}
    {section === 'receivables' && <ReceivablesPage/>}
    {section === 'purchasing' && <PurchasingPage orderId={view === 'purchasing' ? id : null} />}
    {info && <div class="page"><div class="page-header"><h1>{info.title}</h1><span class="badge badge-muted">Planned</span></div><section class="workspace-editor"><h2>{info.description}</h2><p>{info.scope}</p></section></div>}
  </section>;
}
