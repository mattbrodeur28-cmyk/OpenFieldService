import { AgreementActivation } from "./agreement-activation";
import { AgreementMaintenance } from "./agreement-maintenance";
import { AgreementOperations } from "./agreement-operations";
import { AgreementLifecycle } from "./agreement-lifecycle";
import { AgreementDocument, HistoricalAgreementDocument, type ProposedAgreementDocument } from "./agreement-document";
import { AgreementReview, type AgreementReviewState } from "./agreement-review";
import { useEffect, useState } from 'preact/hooks';
import { accountRequest, useAccount, isAdministrator } from '../auth';
import { useApp } from '../context';
import { useConnectivity } from '../hooks/use-connectivity';
import { useGuardedCommand } from '../hooks/use-guarded-command';
import { quoteMoney, scaledInput, scaledText } from '../quote-input.mjs';
import { Dialog, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { TextField } from './ui/input';
import { Select } from './ui/select';
import { Notice, Checkbox, Table, Badge, Textarea } from './ui/surfaces';
import './agreements-page.css';
interface Candidate {
    id: string;
    name: string;
    serialNumber?: string;
    siteId?: string;
}
interface Document {
    id: string;
    customerId: string;
    title: string;
    scope: string;
    exclusions: string;
    terms: string;
    documentReference: string;
    startsOn: string;
    endsOn: string;
    renewalPolicy: string;
    priceCents: number | null;
    currency: 'USD';
    billingFrequency: string;
    siteIds: string[];
    assetIds: string[];
    archived: boolean;
}
interface Agreement {
    id: string;
    identifier: string;
    title: string;
    customer_id: string;
    version: number;
    archived: number;
    status: string;
    document: Document;
}
interface Detail {
    writeLock?: string | null;
    proposedDocument?: ProposedAgreementDocument | null;
    review?: AgreementReviewState;
    agreement: Agreement;
    customer: Candidate;
    scope: {
        sites: Candidate[];
        assets: Candidate[];
    };
}
interface Listing {
    rows: {
        id: string;
        identifier: string;
        title: string;
        customerName: string;
        offerStatus?: string | null;
        operationalState?: string;
        status: string;
        version: number;
    }[];
    total: number;
    page: number;
}
interface History {
    rows: {
        version: number;
        actorId: string;
        reason: string;
        createdAt: string;
        document: Document;
    }[];
    hasMore: boolean;
}
const blank = (): Document => ({ id: crypto.randomUUID(), customerId: '', title: '', scope: '', exclusions: '', terms: '', documentReference: '', startsOn: '', endsOn: '', renewalPolicy: 'manual_review', priceCents: null, currency: 'USD', billingFrequency: 'fixed', siteIds: [], assetIds: [], archived: false });
function NativePicker({ kind, customerId, selected, labels, disabled, change }: {
    kind: 'customer' | 'site' | 'asset';
    customerId: string;
    selected: string[];
    labels: Candidate[];
    disabled: boolean;
    change(ids: string[], rows: Candidate[]): void;
}) {
    const [search, setSearch] = useState(''), [page, setPage] = useState(1), [data, setData] = useState<{
        rows: Candidate[];
        hasMore: boolean;
    } | null>(null), [error, setError] = useState('');
    useEffect(() => {
        if (kind !== 'customer' && !customerId)
            return;
        let live = true;
        setData(null);
        setError('');
        const timer = setTimeout(() => {
            void accountRequest<{
                rows: Candidate[];
                hasMore: boolean;
            }>('/api/agreements/options?' + new URLSearchParams({ kind, search, page: String(page), ...(kind !== 'customer' ? { customerId } : {}) })).then(value => {
                if (live)
                    setData(value);
            }).catch(e => {
                if (live)
                    setError((e as Error).message);
            });
        }, 200);
        return () => { live = false; clearTimeout(timer); };
    }, [kind, customerId, search, page]);
    return <section class="agreement-picker"><h4>{kind === 'customer' ? 'Customer' : kind === 'site' ? 'Locations' : 'Equipment'}</h4><TextField label={'Search ' + (kind === 'asset' ? 'equipment name or serial number' : kind === 'site' ? 'locations' : 'customers')} type="search" maxLength={200} value={search} disabled={disabled} onInput={e => { setSearch(e.currentTarget.value); setPage(1); }}/>{error && <Notice tone="warning">{error}</Notice>}<div class="agreement-candidates">{data?.rows.map(row => <Checkbox key={row.id} label={row.name + (row.serialNumber ? ' · ' + row.serialNumber : '')} checked={selected.includes(row.id)} disabled={disabled} onChange={e => change(kind === 'customer' ? [row.id] : e.currentTarget.checked ? [...selected, row.id] : selected.filter(id => id !== row.id), [...labels.filter(c => c.id !== row.id), row])}/>)}{data && !data.rows.length && <p class="workspace-help">No matches.</p>}{!data && !error && <p role="status">Loading native records…</p>}</div><div class="agreement-actions"><Button disabled={page <= 1 || disabled} onClick={() => setPage(p => p - 1)}>Previous</Button><span>Page {page}</span><Button disabled={!data?.hasMore || disabled} onClick={() => setPage(p => p + 1)}>Next</Button></div>{kind !== 'customer' && <details><summary>{selected.length} selected across searches</summary>{selected.map(id => <div class="agreement-actions" key={id}><span>{labels.find(c => c.id === id)?.name || id}</span><Button disabled={disabled} onClick={() => change(selected.filter(v => v !== id), labels)}>Remove</Button></div>)}</details>}</section>;
}
function DraftForm({ detail, close, saved }: {
    detail: Detail | null;
    close(): void;
    saved(id: string): void;
}) {
    const [document, setDocument] = useState<Document>(() => detail ? { ...detail.agreement.document, siteIds: [...detail.agreement.document.siteIds], assetIds: [...detail.agreement.document.assetIds] } : blank()), [price, setPrice] = useState(detail?.agreement.document.priceCents === null || !detail ? '' : scaledText(detail.agreement.document.priceCents, 2)), [reason, setReason] = useState(''), [sites, setSites] = useState<Candidate[]>(detail?.scope.sites ?? []), [assets, setAssets] = useState<Candidate[]>(detail?.scope.assets ?? []), [customers, setCustomers] = useState<Candidate[]>(detail ? [detail.customer] : []);
    const { readOnly } = useConnectivity();
    const command = useGuardedCommand<Record<string, unknown>, {
        agreement: Agreement;
    }>('/api/agreements', value => saved(value.agreement.id)), locked = readOnly || command.busy || command.uncertain;
    function update(patch: Partial<Document>) { command.changed(); setDocument(old => ({ ...old, ...patch })); }
    function submit() {
        try {
            if (!document.customerId || !document.title.trim() || reason.trim().length < 10)
                throw new Error('Choose a customer, enter a title and record a reason of at least 10 characters.');
            void command.run({ ...document, priceCents: price.trim() === '' ? null : scaledInput(price, 2, 'Proposed price', 10000000000), requestKey: crypto.randomUUID(), expectedVersion: detail?.agreement.version ?? 0, reason });
        }
        catch (e) {
            command.setError((e as Error).message);
        }
    }
    return <Dialog class="bid-review-dialog agreement-form" close={() => {
            if (command.canClose())
                close();
        }}><DialogTitle>{detail ? 'Edit agreement draft' : 'New agreement draft'}</DialogTitle><Notice>Draft scope only. Saving does not activate coverage, create jobs, renew automatically or communicate with the customer.</Notice>{command.error && <Notice tone="danger">{command.error}</Notice>}{command.uncertain && <Notice tone="warning">Outcome uncertain. Editing is locked; retry the exact command.</Notice>}{detail ? <p><strong>Customer:</strong> {detail.customer.name} · customer identity is retained.</p> : <><NativePicker kind="customer" customerId="" selected={document.customerId ? [document.customerId] : []} labels={customers} disabled={locked} change={(ids, rows) => {
                if (document.customerId === ids[0])
                    return;
                if (document.customerId && document.customerId !== ids[0] && (document.siteIds.length || document.assetIds.length) && !window.confirm('Changing customer clears the selected locations and equipment. Continue?'))
                    return;
                setCustomers(rows);
                setSites([]);
                setAssets([]);
                update({ customerId: ids[0], siteIds: [], assetIds: [] });
            }}/>{document.customerId && <p>Selected customer: {customers.find(c => c.id === document.customerId)?.name}</p>}</>}<TextField label="Agreement title" value={document.title} maxLength={200} disabled={locked} onInput={e => update({ title: e.currentTarget.value })}/>{(['scope', 'exclusions', 'terms'] as const).map(key => <label class="ui-field" key={key}>{key === 'scope' ? 'Proposed scope' : key === 'exclusions' ? 'Exclusions' : 'Proposed terms'}<Textarea value={document[key]} maxLength={key === 'exclusions' ? 8000 : 12000} disabled={locked} onInput={e => update({ [key]: e.currentTarget.value })}/></label>)}<TextField label="Document reference (not uploaded acceptance evidence)" value={document.documentReference} maxLength={1000} disabled={locked} onInput={e => update({ documentReference: e.currentTarget.value })}/><div class="agreement-grid"><TextField label="Proposed start" type="date" value={document.startsOn} disabled={locked} onInput={e => update({ startsOn: e.currentTarget.value })}/><TextField label="Proposed end" type="date" value={document.endsOn} disabled={locked} onInput={e => update({ endsOn: e.currentTarget.value })}/><TextField label="Proposed USD price (blank = unknown)" value={price} inputMode="decimal" disabled={locked} onInput={e => { command.changed(); setPrice(e.currentTarget.value); }}/><Select label="Price frequency" value={document.billingFrequency} options={['fixed', 'monthly', 'quarterly', 'annual'].map(value => ({ value, label: value }))} disabled={locked} onValueChange={billingFrequency => update({ billingFrequency })}/><Select label="Renewal policy" value={document.renewalPolicy} options={[{ value: 'manual_review', label: 'Manual review' }, { value: 'no_renewal', label: 'No renewal' }]} disabled={locked} onValueChange={renewalPolicy => update({ renewalPolicy })}/></div>{document.customerId && <div class="agreement-grid"><NativePicker key={'site-' + document.customerId} kind="site" customerId={document.customerId} selected={document.siteIds} labels={sites} disabled={locked} change={(siteIds, rows) => { setSites(rows); update({ siteIds }); }}/><NativePicker key={'asset-' + document.customerId} kind="asset" customerId={document.customerId} selected={document.assetIds} labels={assets} disabled={locked} change={(assetIds, rows) => { setAssets(rows); update({ assetIds }); }}/></div>}<p class="workspace-help">Every selected equipment item must belong to a selected location. Locations do not imply whole-building coverage. Historical scope remains retained.</p><Checkbox label="Archive this draft (retain all revisions)" checked={document.archived} disabled={locked} onChange={e => update({ archived: e.currentTarget.checked })}/><TextField label="Change reason" value={reason} maxLength={2000} disabled={locked} onInput={e => { command.changed(); setReason(e.currentTarget.value); }}/><div class="agreement-actions"><Button disabled={command.busy || command.uncertain} onClick={() => {
            if (command.canClose())
                close();
        }}>Cancel</Button><Button variant="primary" disabled={readOnly || command.busy} onClick={submit}>{command.uncertain ? 'Retry exact command' : 'Save draft revision'}</Button></div></Dialog>;
}
export function AgreementsPage({ id }: {
    id: string | null;
}) {
    const { user } = useAccount(), { navigate } = useApp(), { readOnly } = useConnectivity(), [list, setList] = useState<Listing | null>(null), [detail, setDetail] = useState<Detail | null>(null), [history, setHistory] = useState<History | null>(null), [page, setPage] = useState(1), [historyPage, setHistoryPage] = useState(1), [search, setSearch] = useState(''), [archived, setArchived] = useState(false), [revision, setRevision] = useState(0), [error, setError] = useState(''), [editing, setEditing] = useState(false), [tab, setTab] = useState<'details' | 'lifecycle' | 'authorization' | 'maintenance' | 'operations' | 'history'>('details');
    useEffect(() => {
        let live = true;
        setError('');
        setDetail(null);
        setList(null);
        setHistory(null);
        const path = id ? '/api/agreements/' + id : '/api/agreements?' + new URLSearchParams({ page: String(page), search, includeArchived: String(archived) });
        void accountRequest<Detail & Listing>(path).then(value => {
            if (live) {
                if (id)
                    setDetail(value);
                else
                    setList(value);
            }
        }).catch(e => {
            if (live)
                setError((e as Error).message);
        });
        return () => { live = false; };
    }, [id, page, search, archived, revision]);
    useEffect(() => {
        if (!id)
            return;
        let live = true;
        void accountRequest<History>(`/api/agreements/${id}/history?page=${historyPage}`).then(value => {
            if (live)
                setHistory(value);
        }).catch(e => {
            if (live)
                setError((e as Error).message);
        });
        return () => { live = false; };
    }, [id, historyPage, revision]);
    useEffect(() => { setHistoryPage(1); setEditing(false); }, [id]);
    const d = detail?.agreement.document;
    return <div class="page agreements-page">
        <header class="page-header"><div><h1>{detail?.agreement.identifier || 'Agreements'}</h1><p class="workspace-help">Maintenance agreement scope, acceptance and operational authorization.</p></div><div class="agreement-actions">{id && <Button onClick={() => navigate('/agreements')}>All agreements</Button>}<Button onClick={() => setRevision(r => r + 1)}>Refresh</Button>{isAdministrator(user) && <Button variant="primary" disabled={readOnly || (!!id && !detail) || !!detail?.writeLock} onClick={() => setEditing(true)}>{id ? 'Edit draft' : 'New agreement'}</Button>}</div></header>
        {error && <Notice tone="danger">{error}</Notice>}
        {!id && <><div class="agreement-actions"><TextField label="Find draft or customer" type="search" value={search} maxLength={200} onInput={e => { setSearch(e.currentTarget.value); setPage(1); }}/><Checkbox label="Include archived drafts" checked={archived} onChange={e => { setArchived(e.currentTarget.checked); setPage(1); }}/></div>{list && <><Table label="Agreement drafts"><thead><tr><th>Agreement</th><th>Customer</th><th>Offer / response</th><th>Operational term</th><th>Revision</th></tr></thead><tbody>{list.rows.map(row => <tr key={row.id}><th scope="row"><Button variant="ghost" onClick={() => navigate('/agreements/' + row.id)}>{row.identifier} · {row.title}</Button></th><td>{row.customerName}</td><td><Badge>{row.offerStatus ? ({ offer: 'Offered', delivered: 'Delivery recorded', accepted: 'Acceptance recorded', declined: 'Declined', withdrawn: 'Withdrawn', expired: 'Expired' } as Record<string, string>)[row.offerStatus] : row.status.replaceAll('_', ' ')}</Badge></td><td><Badge>{({ not_authorized: 'Not authorized', not_authorized_yet: 'Before authorization', scheduled: 'Scheduled', active: 'Active term', expired: 'Term ended', cancelled: 'Cancelled' } as Record<string, string>)[row.operationalState ?? ''] || 'Not available'}</Badge></td><td>{row.version}</td></tr>)}</tbody></Table>{!list.rows.length && <p>No matching agreement drafts.</p>}<div class="agreement-actions"><Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button><span>{list.total} drafts · Page {page}</span><Button disabled={page * 25 >= list.total} onClick={() => setPage(p => p + 1)}>Next</Button></div></>}</>}
        {detail && d && <>
            <div class="record-header"><div class="record-header-main"><div><h1 class="record-header-title">{d.title}</h1><div class="record-header-subtitle"><span>{detail.agreement.identifier}</span><span>{detail.customer.name}</span><span>{d.startsOn || 'Start unconfigured'} → {d.endsOn || 'End unconfigured'}</span><span>{d.priceCents === null ? 'Price unknown' : quoteMoney(d.priceCents) + ' ' + d.billingFrequency} · {d.renewalPolicy.replaceAll('_', ' ')}</span></div></div></div><div class="page-header-right"><Button variant="ghost" onClick={() => navigate('/customers/' + d.customerId)}>{detail.customer.name}</Button></div></div>
            {detail.writeLock && <Notice>{detail.writeLock}</Notice>}
            <div class="record-tabs" role="tablist">{([['details', 'Details'], ['lifecycle', 'Documents & lifecycle'], ['authorization', 'Authorization'], ['maintenance', 'Maintenance & entitlements'], ['operations', 'Renewals & profitability'], ['history', 'History']] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} class={'record-tab' + (tab === key ? ' is-active' : '')} onClick={() => setTab(key)}>{label}</button>)}</div>
            {tab === 'details' && <>{(['scope', 'exclusions', 'terms', 'documentReference'] as const).map(key => <section class="detail-section" key={key}><h3>{key === 'documentReference' ? 'Document reference' : key}</h3><p class="agreement-text">{d[key] || 'Not recorded'}</p></section>)}<div class="agreement-grid"><section><h3>Selected locations</h3>{detail.scope.sites.map(site => <p key={site.id}>{site.name}</p>)}</section><section><h3>Selected equipment</h3>{detail.scope.assets.map(asset => <p key={asset.id}><Button variant="ghost" onClick={() => navigate('/assets/' + asset.id)}>{asset.name}</Button> · {asset.serialNumber}</p>)}</section></div></>}
            {tab === 'lifecycle' && <><Notice>Scope, acceptance and operational authorization are separate. Included visits/hours and generated maintenance work require their own reviewed workflows.</Notice><AgreementDocument key={"pdf-" + detail.agreement.id + ":" + detail.agreement.version} id={detail.agreement.id} version={detail.agreement.version} archived={!!detail.agreement.archived} reviewStatus={detail.review?.status} document={detail.proposedDocument} saved={() => setRevision(r => r + 1)}/><AgreementReview key={detail.agreement.id + ":" + detail.agreement.version} agreementId={detail.agreement.id} version={detail.agreement.version} archived={!!detail.agreement.archived} review={detail.review} offerLocked={!!detail.writeLock} saved={() => setRevision(r => r + 1)}/><AgreementLifecycle key={"lifecycle-" + detail.agreement.id + ":" + detail.agreement.version} id={detail.agreement.id} version={detail.agreement.version} customerName={detail.customer.name} changed={() => setRevision(r => r + 1)}/></>}
            {tab === 'authorization' && <AgreementActivation key={"activation-" + detail.agreement.id + ":" + detail.agreement.version} id={detail.agreement.id} version={detail.agreement.version} assets={detail.scope.assets} changed={() => setRevision(r => r + 1)}/>}
            {tab === 'maintenance' && <AgreementMaintenance key={"maint-" + detail.agreement.id + ":" + detail.agreement.version} agreementId={detail.agreement.id} assets={detail.scope.assets} changed={() => setRevision(r => r + 1)}/>}
            {tab === 'operations' && <AgreementOperations key={"ops-" + detail.agreement.id + ":" + detail.agreement.version} agreementId={detail.agreement.id} currentTitle={d.title} startsOn={d.startsOn} endsOn={d.endsOn}/>}
            {tab === 'history' && <details open><summary>Retained draft revisions</summary>{history?.rows.map(row => <article class="agreement-history" key={row.version}><strong>Revision {row.version}</strong><HistoricalAgreementDocument id={detail.agreement.id} version={row.version}/><small>{row.createdAt} UTC · {row.actorId}</small><p>{row.reason}</p><details><summary>Exact draft scope and terms</summary><pre>{JSON.stringify(row.document, null, 2)}</pre></details></article>)}<div class="agreement-actions"><Button disabled={historyPage <= 1} onClick={() => setHistoryPage(p => p - 1)}>Newer</Button><span>Page {historyPage}</span><Button disabled={!history?.hasMore} onClick={() => setHistoryPage(p => p + 1)}>Older</Button></div></details>}
        </>}
        {!error && !list && !detail && <p role="status">Loading native agreements…</p>}
        {editing && <DraftForm key={id || 'new'} detail={detail} close={() => setEditing(false)} saved={savedId => { setEditing(false); setRevision(r => r + 1); navigate('/agreements/' + savedId); }}/>}
    </div>;
}
