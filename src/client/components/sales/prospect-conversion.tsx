import { useEffect, useState } from 'preact/hooks';
import { accountRequest } from '../../auth';
import { useGuardedCommand } from '../../hooks/use-guarded-command';
import type { Opportunity } from '../../sales-types';
import { Dialog, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { TextField } from '../ui/input';
import { Select } from '../ui/select';
import { Notice, Checkbox } from '../ui/surfaces';
type AccountChoice = {
    id: string;
    name: string;
    email: string;
    phone: string;
    address: string;
};
type Lookup = {
    customers: AccountChoice[];
    selectedCustomer: AccountChoice | null;
    page: number;
    hasMore: boolean;
    sites: {
        id: string;
        name: string;
        address: string;
    }[];
    sitesTruncated: boolean;
};
type Site = {
    id: string;
    name: string;
    address: string;
};
export function ProspectConversion({ row, disabled, close, saved }: {
    row: Opportunity;
    disabled: boolean;
    close(): void;
    saved(row: Opportunity): void;
}) {
    const [mode, setMode] = useState('existing'), [search, setSearch] = useState(row.prospect_name), [page, setPage] = useState(1), [customerId, setCustomerId] = useState(''), [lookup, setLookup] = useState<Lookup | null>(null), [lookupError, setLookupError] = useState(''), [loading, setLoading] = useState(true), [name, setName] = useState(row.prospect_name), [accountEmail, setAccountEmail] = useState(row.contact_email), [accountPhone, setAccountPhone] = useState(row.contact_phone), [address, setAddress] = useState(''), [sites, setSites] = useState<Site[]>([]), [primary, setPrimary] = useState(''), [addContact, setAddContact] = useState(false), [contactName, setContactName] = useState(row.contact_name), [email, setEmail] = useState(row.contact_email), [phone, setPhone] = useState(row.contact_phone), [role, setRole] = useState('service'), [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false);
    const command = useGuardedCommand<Record<string, unknown>, {
        opportunity: Opportunity;
    }>(`/api/sales/opportunities/${row.id}/prospect-conversion`, result => saved(result.opportunity));
    const locked = disabled || command.busy || command.uncertain;
    const [accountId] = useState(() => crypto.randomUUID()), [contactId] = useState(() => crypto.randomUUID());
    useEffect(() => {
        let live = true;
        setLoading(true);
        setLookupError('');
        void accountRequest<Lookup>(`/api/sales/opportunities/${row.id}/prospect-conversion/options?` + new URLSearchParams({ search, page: String(page), ...(mode === 'existing' && customerId ? { customerId } : {}) })).then(value => {
            if (live) {
                setLookup(value);
                setLoading(false);
            }
        }).catch(e => {
            if (live) {
                setLookupError((e as Error).message);
                setLoading(false);
            }
        });
        return () => { live = false; };
    }, [row.id, search, page, customerId, mode]);
    const customers = lookup?.customers ?? [], chosen = lookup?.selectedCustomer;
    const choices = chosen && !customers.some(c => c.id === chosen.id) ? [chosen, ...customers] : customers;
    function changed() { command.changed(); setConfirmed(false); }
    function submit() {
        if (!confirmed || reason.trim().length < 10) {
            command.setError('Review the customer, locations and contact, then confirm with a reason of at least 10 characters.');
            return;
        }
        if (mode === 'existing' && !customerId) {
            command.setError('Choose the existing customer.');
            return;
        }
        if (mode === 'new' && !name.trim()) {
            command.setError('Enter the new customer name.');
            return;
        }
        if (sites.some(s => !s.name.trim() || !s.address.trim())) {
            command.setError('Each new location needs a name and address.');
            return;
        }
        void command.run({ id: crypto.randomUUID(), requestKey: crypto.randomUUID(), expectedVersion: row.version, target: mode === 'new' ? { mode: 'new', account: { id: accountId, name, email: accountEmail, phone: accountPhone, address } } : { mode: 'existing', customerId }, sites, primarySiteId: primary || null, contacts: addContact ? [{ id: contactId, name: contactName, email, phone, roles: [role], emailOk: true, phoneOk: true, smsOk: false, siteId: null }] : [], reason, reviewAttested: true });
    }
    return <Dialog class="bid-review-dialog prospect-conversion-dialog" close={() => {
            if (command.canClose())
                close();
        }}><DialogTitle>Convert prospect to customer</DialogTitle><p class="workspace-help">{row.title} · saved prospect version {row.version}</p><Notice>This links the saved opportunity to a native customer. The opportunity stays in its current stage; no job, invoice, contract or customer message is created.</Notice>{command.error && <Notice tone="danger">{command.error}</Notice>}{command.uncertain && <Notice tone="warning">Outcome uncertain. Editing is locked; retry the exact conversion before leaving.</Notice>}
 <Select label="Customer mapping" value={mode} disabled={locked} options={[{ value: 'existing', label: 'Reuse an existing customer' }, { value: 'new', label: 'Create a new customer' }]} onValueChange={v => { changed(); setMode(v); setCustomerId(''); setPrimary(''); setSites([]); setPage(1); }}/>
 <TextField label="Search existing customers before creating one" type="search" value={search} maxLength={200} disabled={locked} onInput={e => { setSearch(e.currentTarget.value); setPage(1); }}/>
 {lookupError && <Notice tone="danger">{lookupError}</Notice>}{loading && <p role="status">Loading customer matches…</p>}
 <Select label="Existing customer matches" value={customerId || 'none'} disabled={locked || loading || !!lookupError} options={[{ value: 'none', label: mode === 'existing' ? 'Choose a customer' : 'Review matches; switch to Reuse to select' }, ...choices.map(c => ({ value: c.id, label: c.name + (c.email ? ' · ' + c.email : '') }))]} onValueChange={v => {
            changed();
            setCustomerId(v === 'none' ? '' : v);
            setPrimary('');
            if (v !== 'none')
                setMode('existing');
        }}/>
 <div class="finance-actions"><Button disabled={locked || loading || page <= 1} onClick={() => setPage(v => v - 1)}>Previous matches</Button><span>Page {page}</span><Button disabled={locked || loading || !lookup?.hasMore} onClick={() => setPage(v => v + 1)}>Next matches</Button></div>
 {mode === 'new' && <section class="sales-form"><h3>New customer</h3><TextField label="Customer / company name" value={name} maxLength={200} disabled={locked} onInput={e => { changed(); setName(e.currentTarget.value); }}/><TextField label="Account email" type="email" value={accountEmail} maxLength={254} disabled={locked} onInput={e => { changed(); setAccountEmail(e.currentTarget.value); }}/><TextField label="Account phone" value={accountPhone} maxLength={60} disabled={locked} onInput={e => { changed(); setAccountPhone(e.currentTarget.value); }}/><TextField label="Billing address" value={address} maxLength={500} disabled={locked} onInput={e => { changed(); setAddress(e.currentTarget.value); }}/><p class="workspace-help">Uses this opportunity’s {row.segment} classification. Matching existing names or email addresses require account reuse.</p></section>}
 <section class="sales-form"><h3>Service locations</h3><p class="workspace-help">Create the customer's buildings here. Equipment is added under its actual location later.</p>{sites.map((site, index) => <fieldset class="prospect-location" key={site.id}><legend>New location {index + 1}</legend><TextField label="Location name" value={site.name} maxLength={200} disabled={locked} onInput={e => { changed(); const value = e.currentTarget.value; setSites(current => current.map(s => s.id === site.id ? { ...s, name: value } : s)); }}/><TextField label="Service address" value={site.address} maxLength={1000} disabled={locked} onInput={e => { changed(); const value = e.currentTarget.value; setSites(current => current.map(s => s.id === site.id ? { ...s, address: value } : s)); }}/><Button disabled={locked} onClick={() => {
                changed();
                setSites(current => current.filter(s => s.id !== site.id));
                if (primary === site.id)
                    setPrimary('');
            }}>Remove location</Button></fieldset>)}<Button disabled={locked || sites.length >= 10} onClick={() => { changed(); setSites(current => [...current, { id: crypto.randomUUID(), name: '', address: '' }]); }}>Add service location</Button><Select label="Opportunity's primary location (optional)" value={primary || 'none'} disabled={locked || loading} options={[{ value: 'none', label: 'Choose later' }, ...(mode === 'existing' ? (lookup?.sites ?? []) : []).map(s => ({ value: s.id, label: s.name })), ...sites.map((s, i) => ({ value: s.id, label: s.name || `New location ${i + 1}` }))]} onValueChange={v => { changed(); setPrimary(v === 'none' ? '' : v); }}/>{lookup?.sitesTruncated && mode === 'existing' && <Notice tone="warning">Only the first 100 existing locations are listed. Leave the primary location unset and select it through the searchable native location workflow afterward.</Notice>}</section>
 <Checkbox label="Create a reviewed CRM contact on this account" checked={addContact} disabled={locked} onChange={e => { changed(); setAddContact(e.currentTarget.checked); }}/>{addContact && <section class="sales-form"><TextField label="Contact name" value={contactName} maxLength={200} disabled={locked} onInput={e => { changed(); setContactName(e.currentTarget.value); }}/><TextField label="Contact email" type="email" value={email} maxLength={254} disabled={locked} onInput={e => { changed(); setEmail(e.currentTarget.value); }}/><TextField label="Contact phone" value={phone} maxLength={60} disabled={locked} onInput={e => { changed(); setPhone(e.currentTarget.value); }}/><Select label="Contact role" value={role} disabled={locked} options={[{ value: 'service', label: 'Service' }, { value: 'billing', label: 'Billing' }, { value: 'site_supervisor', label: 'Site supervisor' }, { value: 'estimator', label: 'Estimator' }, { value: 'other', label: 'Other' }]} onValueChange={v => { changed(); setRole(v); }}/><p class="workspace-help">Email/phone are marked usable after your review. SMS stays off. No communication is sent; existing contacts are retained and are not copied.</p></section>}
 <TextField label="Conversion / account mapping reason" value={reason} maxLength={2000} disabled={locked} onInput={e => { changed(); setReason(e.currentTarget.value); }}/><Checkbox label="I checked for duplicates and reviewed the account, locations and contact details." checked={confirmed} disabled={locked} onChange={e => { command.changed(); setConfirmed(e.currentTarget.checked); }}/><div class="finance-actions"><Button disabled={command.busy || command.uncertain} onClick={() => {
            if (command.canClose())
                close();
        }}>Cancel</Button><Button variant="primary" disabled={disabled || command.busy || (!command.uncertain && (loading || !!lookupError || !confirmed))} onClick={submit}>{command.uncertain ? 'Retry exact conversion' : 'Convert prospect'}</Button></div>
 </Dialog>;
}
interface RetainedConversion {
    id: string;
    customerId: string;
    primarySiteId: string | null;
    actorId: string;
    reason: string;
    createdAt: string;
    createdCustomer: boolean;
    siteIds: string[];
    contactIds: string[];
}
export function ProspectConversionRecord({ row, actorName }: {
    row: Opportunity;
    actorName(id: string): string;
}) {
    const [conversion, setConversion] = useState<RetainedConversion | null>(null), [error, setError] = useState('');
    useEffect(() => {
        let live = true;
        setConversion(null);
        setError('');
        void accountRequest<{
            conversion: RetainedConversion | null;
        }>(`/api/sales/opportunities/${row.id}/prospect-conversion`).then(value => { if (live)
            setConversion(value.conversion); }).catch(e => { if (live)
            setError((e as Error).message); });
        return () => { live = false; };
    }, [row.id, row.version]);
    if (error)
        return <Notice tone="warning">Conversion history could not be loaded: {error}</Notice>;
    if (!conversion)
        return null;
    return <details class="sales-details"><summary>Retained prospect conversion</summary><p>{conversion.createdCustomer ? 'Created a native customer' : 'Reused an existing native customer'} · {conversion.siteIds.length} new service locations · {conversion.contactIds.length} new contacts</p><p>{conversion.reason}</p><small>{actorName(conversion.actorId)} · {conversion.createdAt} UTC</small><p><a href={'/customers/' + conversion.customerId}>Open linked customer and locations</a></p>{row.customer_id !== conversion.customerId && <Notice tone="warning">The opportunity’s current customer differs from its original conversion. Review the retained conversion and subsequent audit before changing business links.</Notice>}</details>;
}
