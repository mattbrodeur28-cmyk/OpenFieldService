import { useEffect, useRef, useState } from 'preact/hooks';
import type { DraftLine, EstimateResult } from '../../quote-types';
import type { EstimateKind } from '../../estimating-types';
import { estimateLabels } from '../../estimating-types';
import { quoteMoney, scaledText } from '../../quote-input.mjs';
import { Button } from '../ui/button';
import { Notice } from '../ui/surfaces';

type Field = 'description' | 'quantity' | 'headcount' | 'unitCost' | 'unitSell' | 'materialMultiplier' | 'discount' | 'materialMisc' | 'ot' | 'dt' | 'tax' | 'total';
type Column = { key: Field; label: string; numeric?: boolean; computed?: boolean };

const materialColumns: Column[] = [{ key: 'description', label: 'Items' }, { key: 'quantity', label: 'Quantity', numeric: true }, { key: 'unitCost', label: 'Unit cost ($)', numeric: true }, { key: 'unitSell', label: 'Base price ($)', numeric: true }, { key: 'materialMultiplier', label: 'Multiplier (%)', numeric: true }, { key: 'discount', label: 'Discount (%)', numeric: true }, { key: 'materialMisc', label: 'Misc ($)', numeric: true }, { key: 'tax', label: 'Tax', computed: true }, { key: 'total', label: 'Total', computed: true }];
const laborColumns: Column[] = [{ key: 'description', label: 'Labor / role' }, { key: 'quantity', label: 'Labor hours', numeric: true }, { key: 'unitCost', label: 'Cost of labor ($/hr)', numeric: true }, { key: 'unitSell', label: 'Base bill rate ($/hr)', numeric: true }, { key: 'tax', label: 'Tax', computed: true }, { key: 'total', label: 'Total', computed: true }];
const otherColumns: Column[] = [{ key: 'description', label: 'Item / charge' }, { key: 'quantity', label: 'Quantity', numeric: true }, { key: 'unitCost', label: 'Unit cost ($)', numeric: true }, { key: 'unitSell', label: 'Unit price ($)', numeric: true }, { key: 'discount', label: 'Discount (%)', numeric: true }, { key: 'tax', label: 'Tax', computed: true }, { key: 'total', label: 'Total', computed: true }];
const unifiedColumns: Column[] = [{ key: 'description', label: 'Item / role' }, { key: 'quantity', label: 'Quantity', numeric: true }, { key: 'unitCost', label: 'Unit cost ($)', numeric: true }, { key: 'unitSell', label: 'Unit price ($)', numeric: true }, { key: 'materialMultiplier', label: 'Multiplier (%)', numeric: true }, { key: 'discount', label: 'Discount (%)', numeric: true }, { key: 'materialMisc', label: 'Misc ($)', numeric: true }, { key: 'tax', label: 'Tax', computed: true }, { key: 'total', label: 'Total', computed: true }];
const laborKinds = ['technician', 'apprentice', 'after_hours'];
const cellValue = (line: DraftLine, key: Field) => key === 'ot' ? line.laborRate === 'ot' ? 'TRUE' : 'FALSE' : key === 'dt' ? line.laborRate === 'dt' ? 'TRUE' : 'FALSE' : key === 'tax' || key === 'total' ? '' : String(line[key] ?? '0.00');
const range = (a: [number, number], b: [number, number]) => ({ top: Math.min(a[0], b[0]), bottom: Math.max(a[0], b[0]), left: Math.min(a[1], b[1]), right: Math.max(a[1], b[1]) });
function fresh(kind: EstimateKind): DraftLine { return { id: crypto.randomUUID(), kind, description: estimateLabels[kind], quantity: '1.000', headcount: '1', unitCost: kind === 'material' ? '' : '0.00', unitSell: kind === 'material' ? '' : '0.00', discount: '0.00', materialId: null, costOverrideReason: '', travelGroup: ['distance', 'fuel'].includes(kind) ? 'visit-1' : '', includesFuel: false, ...(kind === 'material' ? { materialMultiplier: '0.00', materialMisc: '0.00', pricingPending: true as const, pendingPricingNote: 'Awaiting supplier identification and pricing.' } : {}) }; }

function CostingGrid({ title, section, rows, columns, preview, disabled, change, commit, patch, details, addKinds, add, emptyText }: {
    title: string; section: string; rows: DraftLine[]; columns: Column[]; preview: EstimateResult | null; disabled: boolean;
    change(line: DraftLine, key: Field, value: string): void; commit(next: DraftLine[]): void; patch(line: DraftLine, key: Field, value: string): DraftLine;
    details(id: string): void; addKinds: EstimateKind[]; add(kind: EstimateKind): void; emptyText: string;
}) {
    const [anchor, setAnchor] = useState<[number, number]>([0, 0]);
    const [active, setActive] = useState<[number, number]>([0, 0]);
    const root = useRef<HTMLDivElement>(null);
    const selected = range(anchor, active);
    function focus(r: number, c: number, extend = false) {
        if (r < 0 || r >= rows.length || c < 0 || c >= columns.length) return;
        setActive([r, c]); if (!extend) setAnchor([r, c]);
        root.current?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`)?.focus();
    }
    function key(event: KeyboardEvent) {
        if (!(event.target instanceof HTMLElement) || !event.target.hasAttribute('data-cell')) return;
        let [r, c] = active;
        if (event.key === 'Enter' || event.key === 'ArrowDown') r += event.shiftKey && event.key === 'Enter' ? -1 : 1;
        else if (event.key === 'ArrowUp') r--;
        else if (event.key === 'ArrowRight') c++;
        else if (event.key === 'ArrowLeft') c--;
        else return;
        if (r < 0 || r >= rows.length || c < 0 || c >= columns.length) return;
        event.preventDefault();
        focus(r, c, event.shiftKey && event.key !== 'Enter');
    }
    function copy(event: ClipboardEvent) {
        if (anchor[0] === active[0] && anchor[1] === active[1]) return;
        event.preventDefault();
        const text = rows.slice(selected.top, selected.bottom + 1).map((line) => columns.slice(selected.left, selected.right + 1).map((col) => {
            const priced = preview?.lines.find((p) => p.id === line.id);
            const cents = priced ? (col.key === 'tax' ? priced.taxCents : priced.totalCents) : null;
            const text = cellValue(line, col.key).replace(/[\t\r\n]/g, ' ');
            return col.computed ? (priced ? (cents === null ? 'Pending' : scaledText(cents, 2)) : 'Recalculate') : (/^[=+@-]/.test(text) ? "'" + text : text);
        }).join('\t')).join('\n');
        event.clipboardData?.setData('text/plain', text);
    }
    function paste(event: ClipboardEvent) {
        if (disabled || !(event.target instanceof HTMLElement) || !event.target.hasAttribute('data-cell')) return;
        const text = event.clipboardData?.getData('text/plain');
        if (!text || !/[\t\n\r]/.test(text)) return;
        event.preventDefault();
        try {
            if (text.length > 50000) throw new Error('Paste at most 50 KB at a time.');
            const matrix = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map((row) => row.split('\t'));
            if (matrix.length > rows.length - active[0]) throw new Error('Add enough rows before pasting this range.');
            const changed = new Map<string, DraftLine>();
            matrix.forEach((values, ri) => {
                if (values.length > columns.length - active[1]) throw new Error('Pasted range exceeds the worksheet columns.');
                const row = rows[active[0] + ri]; let next = row;
                values.forEach((value, ci) => { next = patch(next, columns[active[1] + ci].key, value); });
                changed.set(row.id, next);
            });
            commit(rows.map((row) => changed.get(row.id) ?? row));
        } catch { /* ignore malformed paste */ }
    }
    return (
        <section class="costing-section" aria-label={section}>
            <header class="costing-section-header"><h4>{title} <span class="costing-section-count">{rows.length}</span></h4><button type="button" class="costing-add" aria-label={`Add ${title} row`} disabled={disabled || rows.length >= 100} onClick={() => add(addKinds[0])}>+</button></header>
            <div class="costing-grid-scroll" ref={root} onKeyDown={key} onPaste={paste} onCopy={copy}>
                <table class="costing-grid" role="grid" aria-label={`${section} costing`} aria-rowcount={rows.length + 1} aria-colcount={columns.length + 2}>
                    <thead><tr><th scope="col">#</th>{columns.map((col) => <th key={col.key} scope="col">{col.label}</th>)}<th scope="col"></th></tr></thead>
                    <tbody>
                        {rows.map((line, ri) => {
                            const priced = preview?.lines.find((p) => p.id === line.id);
                            return (
                                <tr key={line.id}>
                                    <th scope="row">{ri + 1}</th>
                                    {columns.map((col, ci) => {
                                        const inRange = ri >= selected.top && ri <= selected.bottom && ci >= selected.left && ci <= selected.right;
                                        return (
                                            <td key={col.key} class={`${col.numeric || col.computed ? 'is-number ' : ''}${inRange ? 'is-selected' : ''}`} aria-selected={inRange} onMouseDown={(event) => { if (event.shiftKey) { event.preventDefault(); focus(ri, ci, true); } else { setAnchor([ri, ci]); setActive([ri, ci]); } }}>
                                                {col.computed
                                                    ? <output tabIndex={0} data-cell={`${ri}:${ci}`} aria-label={`Row ${ri + 1} ${col.label}`} title={col.key === 'tax' && priced ? `Tax rate ${((priced.taxRule?.rateBasisPoints ?? 0) / 100).toFixed(2)}%` : undefined} onFocus={() => setActive([ri, ci])}>{priced ? quoteMoney(col.key === 'tax' ? priced.taxCents : priced.totalCents) : 'Recalculate'}{col.key === 'tax' && priced ? <small class="costing-tax-rate">{((priced.taxRule?.rateBasisPoints ?? 0) / 100).toFixed(2)}%</small> : null}</output>
                                                    : col.key === 'ot' || col.key === 'dt'
                                                        ? <input type="checkbox" data-cell={`${ri}:${ci}`} aria-label={`Row ${ri + 1} ${col.label}`} checked={line.laborRate === col.key} disabled={disabled} onFocus={() => setActive([ri, ci])} onChange={(e) => change(line, col.key, e.currentTarget.checked ? 'TRUE' : 'FALSE')} />
                                                        : <input data-cell={`${ri}:${ci}`} aria-label={`Row ${ri + 1} ${col.label}`} type="text" inputMode={col.numeric ? 'decimal' : 'text'} value={cellValue(line, col.key)} disabled={disabled} maxLength={col.key === 'description' ? 500 : 40} onFocus={() => setActive([ri, ci])} onInput={(e) => change(line, col.key, e.currentTarget.value)} />}
                                            </td>
                                        );
                                    })}
                                    <td><Button variant="ghost" disabled={disabled} aria-label={`Remove row ${ri + 1}`} onClick={() => commit(rows.filter((l) => l.id !== line.id))}>×</Button></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {!rows.length && <p class="costing-empty">{emptyText}</p>}
            </div>
        </section>
    );
}

/** Editable cells backed by the same native quote lines, all sections on one page. */
export function CostingSheet({ lines, preview, disabled, replace, details, onSave, saving = false, canSave = true }: {
    lines: DraftLine[];
    preview: EstimateResult | null;
    disabled: boolean;
    replace(lines: DraftLine[]): void;
    details(id: string): void;
    onSave?(): void;
    saving?: boolean;
    canSave?: boolean;
}) {
    const [error, setError] = useState('');
    const undo = useRef<DraftLine[][]>([]), redo = useRef<DraftLine[][]>([]), expected = useRef(JSON.stringify(lines)), coalesce = useRef<string | null>(null);
    const [historyTick, setHistoryTick] = useState(0);
    useEffect(() => { const next = JSON.stringify(lines); if (next !== expected.current) { undo.current = []; redo.current = []; coalesce.current = null; expected.current = next; setHistoryTick((v) => v + 1); } }, [lines]);

    function commit(next: DraftLine[], key: string | null = null) {
        if (disabled) return;
        if (key === null || coalesce.current !== key) { undo.current.push(lines); if (undo.current.length > 100) undo.current.shift(); }
        coalesce.current = key;
        redo.current = [];
        expected.current = JSON.stringify(next);
        replace(next);
        setHistoryTick((v) => v + 1);
        setError('');
    }
    function history(back: boolean) {
        if (disabled) return;
        const from = back ? undo.current : redo.current, to = back ? redo.current : undo.current, next = from.pop();
        if (!next) return;
        to.push(lines); coalesce.current = null; expected.current = JSON.stringify(next); replace(next); setHistoryTick((v) => v + 1);
    }
    function patch(line: DraftLine, key: Field, value: string): DraftLine {
        if (key === 'tax' || key === 'total') throw new Error('Tax and Total are calculated. Paste into editable cells only.');
        if (key === 'ot' || key === 'dt') {
            if (!/^(true|false|1|0|yes|no)$/i.test(value)) throw new Error('OT/DT cells accept TRUE/FALSE, YES/NO or 1/0.');
            const checked = /^(true|1|yes)$/i.test(value), rate = key === 'ot' ? 'ot' : 'dt';
            return { ...line, laborRate: checked ? rate : line.laborRate === rate ? undefined : line.laborRate };
        }
        if (value.length > (key === 'description' ? 500 : 40)) throw new Error('A pasted value is too long.');
        return { ...line, [key]: value };
    }
    function change(line: DraftLine, key: Field, value: string) {
        try { const next = patch(line, key, value); commit(lines.map((l) => l.id === line.id ? next : l), `${line.id}:${key}`); }
        catch (e) { setError((e as Error).message); }
    }
    function add(kind: EstimateKind) { if (lines.length < 100) commit([...lines, fresh(kind)]); }
    const totalCost = preview?.lines.reduce((n, l) => n + (l.costCents ?? 0), 0) ?? 0;
    const totalBillable = preview?.lines.reduce((n, l) => n + (l.totalCents ?? 0), 0) ?? 0;
    const profit = totalBillable - totalCost;

    const priced = (id: string) => preview?.lines.find((p) => p.id === id);
    const sectionRows = [
        { key: 'materials', title: 'Materials', rows: lines.filter((l) => l.kind === 'material') },
        { key: 'labor', title: 'Labor', rows: lines.filter((l) => laborKinds.includes(l.kind)) },
        { key: 'other', title: 'Other job costs', rows: lines.filter((l) => l.kind !== 'material' && !laborKinds.includes(l.kind)) },
    ];
    const totalsFor = (rows: DraftLine[]) => {
        const gross = rows.reduce((n, l) => n + (priced(l.id)?.grossCents ?? 0), 0);
        const tax = rows.reduce((n, l) => n + (priced(l.id)?.taxCents ?? 0), 0);
        const total = rows.reduce((n, l) => n + (priced(l.id)?.totalCents ?? 0), 0);
        const cost = rows.reduce((n, l) => n + (priced(l.id)?.costCents ?? 0), 0);
        const prof = gross - cost;
        return { gross, tax, total, cost, profit: prof, margin: gross ? (prof / gross) * 100 : 0 };
    };
    const grand = totalsFor(lines);

    return (
        <section class="costing-workbook" aria-label="Job costing spreadsheet" data-history={historyTick}>
            <header class="costing-toolbar">
                <div class="costing-title">Job costing · {lines.length} row{lines.length === 1 ? '' : 's'}</div>
                <div class="quote-actions"><Button disabled={disabled || !undo.current.length} onClick={() => history(true)}>Undo</Button><Button disabled={disabled || !redo.current.length} onClick={() => history(false)}>Redo</Button></div>
            </header>
            <p class="costing-help">Edit cells directly · Enter / ↑ / ↓ move rows · ← / → move cells · Shift-click selects a range · Paste tab-separated cells from Excel or Sheets. Tax uses the billing profile tax rate (Settings → Billing profile).</p>
            {error && <Notice tone="danger">{error}</Notice>}
            <CostingGrid title="Materials" section="materials" rows={lines.filter((l) => l.kind === 'material')} columns={unifiedColumns} preview={preview} disabled={disabled} change={change} commit={commit} patch={patch} details={details} addKinds={['material']} add={add} emptyText="No material rows. Add a material below to start." />
            <CostingGrid title="Labor" section="labor" rows={lines.filter((l) => laborKinds.includes(l.kind))} columns={unifiedColumns} preview={preview} disabled={disabled} change={change} commit={commit} patch={patch} details={details} addKinds={['technician', 'apprentice', 'after_hours']} add={add} emptyText="No labor rows. Add a labor role below to start." />
            <CostingGrid title="Other job costs" section="other" rows={lines.filter((l) => l.kind !== 'material' && !laborKinds.includes(l.kind))} columns={unifiedColumns} preview={preview} disabled={disabled} change={change} commit={commit} patch={patch} details={details} addKinds={['service', 'permit', 'license', 'distance', 'fuel', 'subcontractor']} add={add} emptyText="No other cost rows. Add a category below to start." />
                        <table class="costing-totals">
                <thead><tr><th>Category</th><th>Total gross</th><th>Total tax</th><th>Total cost</th><th>Total profit</th><th>Margin</th></tr></thead>
                <tbody>
                    {sectionRows.map((section) => {
                        const t = totalsFor(section.rows);
                        return (
                            <tr key={section.key}>
                                <th scope="row">{section.title}</th>
                                <td>{quoteMoney(t.gross)}</td>
                                <td>{quoteMoney(t.tax)}</td>
                                <td>{quoteMoney(t.cost)}</td>
                                <td class={t.profit < 0 ? 'project-margin-neg' : 'project-margin-pos'}>{quoteMoney(t.profit)}</td>
                                <td>{t.margin.toFixed(1)}%</td>
                            </tr>
                        );
                    })}
                    <tr class="is-total">
                        <th scope="row">Total</th>
                        <td>{quoteMoney(grand.gross)}</td>
                        <td>{quoteMoney(grand.tax)}</td>
                        <td>{quoteMoney(grand.cost)}</td>
                        <td class={grand.profit < 0 ? 'project-margin-neg' : 'project-margin-pos'}>{quoteMoney(grand.profit)}</td>
                        <td>{grand.margin.toFixed(1)}%</td>
                    </tr>
                </tbody>
            </table>
<footer class="costing-pl">
                <div class="costing-pl-summary">
                    <div><span>Total cost</span><strong>{quoteMoney(totalCost)}</strong></div>
                    <div><span>Total billable</span><strong>{quoteMoney(totalBillable)}</strong></div>
                    <div><span>Profit</span><strong class={profit < 0 ? "project-margin-neg" : "project-margin-pos"}>{quoteMoney(profit)}</strong></div>
                    <div><span>Margin</span><strong class={profit < 0 ? "project-margin-neg" : "project-margin-pos"}>{totalBillable ? `${Math.round((profit / totalBillable) * 1000) / 10}%` : "—"}</strong></div>
                </div>
                {onSave && <div class="quote-actions"><Button variant="primary" disabled={disabled || saving || !canSave} onClick={onSave}>{saving ? "Saving…" : "Save draft"}</Button></div>}
            </footer>
        </section>
    );
}
