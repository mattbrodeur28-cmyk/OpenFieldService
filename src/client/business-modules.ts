import type { View } from './types';
export interface ModulePage { key: string; label: string; path: string; description: string; planned?: boolean }
export interface BusinessModule { view: View; label: string; pages: ModulePage[] }
export const businessModules: Record<'hr' | 'finance' | 'fleet' | 'sales', BusinessModule> = {
  hr: { view: 'hr', label: 'HR', pages: [
    { key: 'staff', label: 'Staff', path: '/hr/staff', description: 'Manage workspace staff accounts and access.' },
    { key: 'onboarding', label: 'Onboarding', path: '/hr/onboarding', description: 'Employee checklists, assigned tasks, and acknowledgments.', planned: true },
    { key: 'documents', label: 'Documents', path: '/hr/documents', description: 'Private personnel files and certifications.', planned: true },
  ] },
  finance: { view: 'finance', label: 'Finance', pages: [
    { key: 'invoices', label: 'Invoices', path: '/invoices', description: 'Job invoices and billing status.' },
    { key: 'receivables', label: 'Receivables', path: '/finance/receivables', description: 'Outstanding balances, aging, and collections.', planned: true },
    { key: 'liabilities', label: 'Liabilities', path: '/finance/liabilities', description: 'Supplier bills, credits, and payment reconciliation.', planned: true },
    { key: 'purchasing', label: 'Purchasing', path: '/purchasing', description: 'Suppliers, purchase orders, approvals, and receipts.' },
  ] },
  fleet: { view: 'fleet', label: 'Fleet', pages: [
    { key: 'vehicles', label: 'Vehicles & maintenance', path: '/fleet/vehicles', description: 'Vehicle assignments, maintenance plans, and service history.' },
    { key: 'inventory', label: 'Truck inventory', path: '/fleet/inventory', description: 'Truck stock, material movements, and job usage.' },
    { key: 'gps', label: 'GPS', path: '/fleet/gps', description: 'Vehicle locations and dispatch tracking.', planned: true },
  ] },
  sales: { view: 'sales', label: 'Sales', pages: [
    { key: 'pipeline', label: 'Pipelines & stages', path: '/sales/pipeline', description: 'Kanban opportunities, stages, follow-ups, and job conversion.' },
    { key: 'quotes', label: 'Quotes', path: '/sales/quotes', description: 'Material and labor estimates, customer proposals, and acceptance.', planned: true },
  ] },
};
