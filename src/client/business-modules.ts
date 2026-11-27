import type { View } from './types';
export interface ModulePage { key: string; label: string; path: string; description: string; planned?: boolean }
export interface BusinessModule { view: View; label: string; pages: ModulePage[] }
export const businessModules: Record<'finance' | 'fleet' | 'sales', BusinessModule> = {
  finance: { view: 'finance', label: 'Ledger', pages: [
    { key: 'ledger', label: 'Ledger', path: '/finance/ledger', description: 'Money in and money out in one combined ledger.' },
    { key: 'invoices', label: 'Invoices', path: '/invoices', description: 'Job invoices and billing status.' },
    { key: 'receivables', label: 'Receivables', path: '/finance/receivables', description: 'Issued-invoice balances, aging, receipts, and collections notes.' },
    { key: 'purchasing', label: 'Purchasing', path: '/purchasing', description: 'Suppliers, purchase orders, approvals, and receipts.' },
  ] },
  fleet: { view: 'fleet', label: 'Fleet', pages: [
    { key: 'vehicles', label: 'Vehicles & maintenance', path: '/fleet/vehicles', description: 'Vehicle assignments, maintenance plans, and service history.' },
    { key: 'inventory', label: 'Stock inventory', path: '/fleet/inventory', description: 'All shared stock locations (buildings and trucks), material movements, and job usage.' },
    { key: 'gps', label: 'GPS', path: '/fleet/gps', description: 'Vehicle locations and dispatch tracking.', planned: true },
  ] },
  sales: { view: 'sales', label: 'Sales', pages: [
    { key: 'pipeline', label: 'Pipelines & stages', path: '/sales/pipeline', description: 'Kanban opportunities, stages, follow-ups, and job conversion.' },
    { key: 'quotes', label: 'Quotes', path: '/sales/quotes', description: 'Internal labor and material estimates with pricing and revision history.' },
  ] },
};
