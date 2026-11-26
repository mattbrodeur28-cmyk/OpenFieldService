import { useEffect, useRef, useState } from 'preact/hooks';
import type { DraftLine, EstimateResult } from '../../quote-types';
import type { EstimateKind } from '../../estimating-types';
import { estimateLabels } from '../../estimating-types';
import { quoteMoney, scaledText } from '../../quote-input.mjs';
import { Button } from '../ui/button';
import { Notice } from '../ui/surfaces';
type Field = 'description' | 'quantity' | 'headcount' | 'unitCost' | 'unitSell' | 'materialMultiplier' | 'discount' | 'materialMisc' | 'ot' | 'dt' | 'tax' | 'total';
type Column = {
    key: Field;
    label: string;
    numeric?: boolean;
    computed?: boolean;
};
const materialColumns: Column[] = [{ key: 'description', label: 'Items' }, { key: 'quantity', label: 'Quantity', numeric: true }, { key: 'unitCost', label: 'Unit cost ($)', numeric: true }, { key: 'unitSell', label: 'Base price ($)', numeric: true }, { key: 'materialMultiplier', label: 'Multiplier (%)', numeric: true }, { key: 'discount', label: 'Discount (%)', numeric: true }, { key: 'materialMisc', label: 'Misc ($)', numeric: true }, { key: 'tax', label: 'Tax', computed: true }, { key: 'total', label: 'Total', computed: true }];
const laborColumns: Column[] = [{ key: 'description', label: 'Labor / role' }, { key: 'quantity', label: 'Labor hours', numeric: true }, { key: 'headcount', label: 'People', numeric: true }, { key: 'unitCost', label: 'Cost of labor ($/hr)', numeric: true }, { key: 'unitSell', label: 'Base bill rate ($/hr)', numeric: true }, { key: 'ot', label: 'OT · 1.5×' }, { key: 'dt', label: 'DT · 2×' }, { key: 'tax', label: 'Tax', computed: true }, { key: 'total', label: 'Total', computed: true }];
const otherColumns: Column[] = [{ key: 'description', label: 'Item / charge' }, { key: 'quantity', label: 'Quantity', numeric: true }, { key: 'unitCost', label: 'Unit cost ($)', numeric: true }, { key: 'unitSell', label: 'Unit price ($)', numeric: true }, { key: 'discount', label: 'Discount (%)', numeric: true }, { key: 'tax', label: 'Tax', computed: true }, { key: 'total', label: 'Total', computed: true }];
const laborKinds = ['technician', 'apprentice', 'after_hours'];
const cellValue = (line: DraftLine, key: Field) => key === 'ot' ? line.laborRate === 'ot' ? 'TRUE' : 'FALSE' : key === 'dt' ? line.laborRate === 'dt' ? 'TRUE' : 'FALSE' : key === 'tax' || key === 'total' ? '' : String(line[key] ?? '0.00');
const range = (a: [
    number,
    number
], b: [
    number,
    number
]) => ({ top: Math.min(a[0], b[0]), bottom: Math.max(a[0], b[0]), left: Math.min(a[1], b[1]), right: Math.max(a[1], b[1]) });
function fresh(kind: EstimateKind): DraftLine { return { id: crypto.randomUUID(), kind, description: estimateLabels[kind], quantity: '1.000', headcount: '1', unitCost: kind === 'material' ? '' : '0.00', unitSell: kind === 'material' ? '' : '0.00', discount: '0.00', materialId: null, costOverrideReason: '', travelGroup: ['distance', 'fuel'].includes(kind) ? 'visit-1' : '', includesFuel: false, ...(kind === 'material' ? { materialMultiplier: '0.00', materialMisc: '0.00', pricingPending: true as const, pendingPricingNote: 'Awaiting supplier identification and pricing.' } : {}) }; }
/** Editable cells backed by the same native quote lines, not a second workbook. */
export function CostingSheet({ lines, preview, disabled, replace, details }: {
    lines: DraftLine[];
    preview: EstimateResult | null;
    disabled: boolean;
    replace(lines: DraftLine[]): void;
    details(id: string): void;
}) {
    const [sheet, setSheet] = useState<'material' | 'labor' | 'other'>('material'), [error, setError] = useState(''), [anchor, setAnchor] = useState<[
        number,
        number
    ]>([0, 0]), [active, setActive] = useState<[
        number,
        number
    ]>([0, 0]), [historyTick, setHistoryTick] = useState(0);
    const root = useRef<HTMLDivElement>(null), undo = useRef<DraftLine[][]>([]), redo = useRef<DraftLine[][]>([]), expected = useRef(JSON.stringify(lines)), coalesce = useRef<string | null>(null);
    const rows = lines.filter(l => sheet === 'material' ? l.kind === 'material' : sheet === 'labor' ? laborKinds.includes(l.kind) : l.kind !== 'material' && !laborKinds.includes(l.kind));
    const columns = sheet === 'material' ? materialColumns : sheet === 'labor' ? laborColumns : otherColumns;
    const selected = range(anchor, active);
    useEffect(() => { const next = JSON.stringify(lines); if (next !== expected.current) {
        undo.current = [];
        redo.current = [];
        coalesce.current = null;
        expected.current = next;
        setHistoryTick(v => v + 1);
    } }, [lines]);
    function commit(next: DraftLine[], key: string | null = null) {
        if (disabled)
            return;
        if (key === null || coalesce.current !== key) {
            undo.current.push(lines);
            if (undo.current.length > 100)
                undo.current.shift();
        }
        coalesce.current = key;
        redo.current = [];
        expected.current = JSON.stringify(next);
        replace(next);
        setHistoryTick(v => v + 1);
        setError('');
    }
    function history(back: boolean) { if (disabled)
        return; const from = back ? undo.current : redo.current, to = back ? redo.current : undo.current; const next = from.pop(); if (!next)
        return; to.push(lines); coalesce.current = null; expected.current = JSON.stringify(next); replace(next); setHistoryTick(v => v + 1); }
    function patch(line: DraftLine, key: Field, value: string): DraftLine {
        if (key === 'tax' || key === 'total')
            throw new Error('Tax and Total are calculated. Paste into editable cells only.');
        if (key === 'ot' || key === 'dt') {
            if (!/^(true|false|1|0|yes|no)$/i.test(value))
                throw new Error('OT/DT cells accept TRUE/FALSE, YES/NO or 1/0.');
            const checked = /^(true|1|yes)$/i.test(value), rate = key === 'ot' ? 'ot' : 'dt';
            return { ...line, laborRate: checked ? rate : line.laborRate === rate ? undefined : line.laborRate };
        }
        if (value.length > (key === 'description' ? 500 : 40))
            throw new Error('A pasted value is too long.');
        return { ...line, [key]: value };
    }
    function change(line: DraftLine, key: Field, value: string) { try {
        const next = patch(line, key, value);
        commit(lines.map(l => l.id === line.id ? next : l), `${line.id}:${key}`);
    }
    catch (e) {
        setError((e as Error).message);
    } }
    function focus(r: number, c: number, extend = false) { if (r < 0 || r >= rows.length || c < 0 || c >= columns.length)
        return; setActive([r, c]); if (!extend)
        setAnchor([r, c]); root.current?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`)?.focus(); }
    function paste(event: ClipboardEvent) {
        if (disabled || !(event.target instanceof HTMLElement) || !event.target.hasAttribute('data-cell'))
            return;
        const text = event.clipboardData?.getData('text/plain');
        if (!text)
            return;
        // A single text cell retains normal cursor-aware editing. Tabular paste is atomic.
        if (!/[\t\n\r]/.test(text))
            return;
        event.preventDefault();
        try {
            if (text.length > 50000)
                throw new Error('Paste at most 50 KB at a time.');
            const matrix = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map(row => row.split('\t'));
            if (matrix.length > rows.length - active[0])
                throw new Error('Add enough rows before pasting this range.');
            const changed = new Map<string, DraftLine>();
            matrix.forEach((values, ri) => { if (values.length > columns.length - active[1])
                throw new Error('Pasted range exceeds the worksheet columns.'); const row = rows[active[0] + ri]; if (values.filter((value, ci) => ['ot', 'dt'].includes(columns[active[1] + ci].key) && /^(true|1|yes)$/i.test(value)).length > 1)
                throw new Error('Choose OT or DT for a labor row, not both.'); let next = row; values.forEach((value, ci) => { next = patch(next, columns[active[1] + ci].key, value); }); changed.set(row.id, next); });
            commit(lines.map(line => changed.get(line.id) ?? line));
        }
        catch (e) {
            setError((e as Error).message);
        }
    }
    function copy(event: ClipboardEvent) {
        if (anchor[0] === active[0] && anchor[1] === active[1])
            return;
        event.preventDefault();
        const text = rows.slice(selected.top, selected.bottom + 1).map(line => columns.slice(selected.left, selected.right + 1).map(col => {
            const priced = preview?.lines.find(p => p.id === line.id);
            const cents = priced ? (col.key === 'tax' ? priced.taxCents : priced.totalCents) : null;
            const text = cellValue(line, col.key).replace(/[\t\r\n]/g, ' ');
            return col.computed ? (priced ? (cents === null ? 'Pending' : scaledText(cents, 2)) : 'Recalculate') : (/^[=+@-]/.test(text) ? "'" + text : text);
        }).join('\t')).join('\n');
        event.clipboardData?.setData('text/plain', text);
    }
    function key(event: KeyboardEvent) {
        if (!(event.target instanceof HTMLElement) || !event.target.hasAttribute('data-cell'))
            return;
        const modifier = event.ctrlKey || event.metaKey;
        if (modifier && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            history(!event.shiftKey);
            return;
        }
        if (modifier && event.key.toLowerCase() === 'y') {
            event.preventDefault();
            history(false);
            return;
        }
        let [r, c] = active;
        if (event.key === 'Enter' || event.key === 'ArrowDown')
            r += event.shiftKey && event.key === 'Enter' ? -1 : 1;
        else if (event.key === 'ArrowUp')
            r--;
        else if (event.key === 'ArrowRight' && modifier)
            c++;
        else if (event.key === 'ArrowLeft' && modifier)
            c--;
        else if (event.key === 'Tab') {
            c += event.shiftKey ? -1 : 1;
            if (c >= columns.length) {
                c = 0;
                r++;
            }
            if (c < 0) {
                c = columns.length - 1;
                r--;
            }
        }
        else
            return;
        if (r < 0 || r >= rows.length || c < 0 || c >= columns.length)
            return;
        event.preventDefault();
        focus(r, c, event.shiftKey && event.key !== 'Tab' && event.key !== 'Enter');
    }
    function add(kind: EstimateKind) { if (lines.length >= 100)
        return; commit([...lines, fresh(kind)]); }
    return <section class="costing-workbook" aria-label="Job costing spreadsheet" data-history={historyTick}>
  <header class="costing-toolbar"><div role="tablist" aria-label="Costing worksheets">{(['material', 'labor', 'other'] as const).map(value => <button key={value} type="button" role="tab" aria-selected={sheet === value} onClick={() => { setSheet(value); setAnchor([0, 0]); setActive([0, 0]); coalesce.current = null; setError(''); }}>{value === 'material' ? 'Materials' : value === 'labor' ? 'Labor' : 'Other job costs'} <span>{lines.filter(l => value === 'material' ? l.kind === 'material' : value === 'labor' ? laborKinds.includes(l.kind) : l.kind !== 'material' && !laborKinds.includes(l.kind)).length}</span></button>)}</div><div class="quote-actions"><Button disabled={disabled || !undo.current.length} onClick={() => history(true)}>Undo</Button><Button disabled={disabled || !redo.current.length} onClick={() => history(false)}>Redo</Button></div></header>
  <p class="costing-help">Edit cells directly · Enter / ↑ / ↓ move rows · Tab moves cells · Ctrl/⌘ + ← / → moves columns · Shift-click selects a range · Paste tab-separated cells from Excel or Sheets.</p>
  {error && <Notice tone="danger">{error}</Notice>}
  <datalist id="costing-material-multipliers">{[0, 30, 60, 90, 200].map(value => <option value={String(value)} key={value}>{value}%</option>)}</datalist>
  <div class="costing-grid-scroll" ref={root} onKeyDown={key} onPaste={paste} onCopy={copy}>
   <table class="costing-grid" role="grid" aria-label={`${sheet} costing`} aria-rowcount={rows.length + 1} aria-colcount={columns.length + 2}><thead><tr><th scope="col">#</th>{columns.map(col => <th key={col.key} scope="col">{col.label}</th>)}<th scope="col">Details</th></tr></thead><tbody>
    {rows.map((line, ri) => {
            const priced = preview?.lines.find(p => p.id === line.id);
            return <tr key={line.id}><th scope="row">{ri + 1}</th>{columns.map((col, ci) => {
                    const inRange = ri >= selected.top && ri <= selected.bottom && ci >= selected.left && ci <= selected.right;
                    return <td key={col.key} class={`${col.numeric || col.computed ? 'is-number ' : ''}${inRange ? 'is-selected' : ''}`} aria-selected={inRange} onMouseDown={event => { if (event.shiftKey) {
                        event.preventDefault();
                        focus(ri, ci, true);
                    }
                    else {
                        setAnchor([ri, ci]);
                        setActive([ri, ci]);
                    } }}>
     {col.computed ? <output tabIndex={0} data-cell={`${ri}:${ci}`} aria-label={`Row ${ri + 1} ${col.label}`} onFocus={() => setActive([ri, ci])}>{priced ? quoteMoney(col.key === 'tax' ? priced.taxCents : priced.totalCents) : 'Recalculate'}</output> : col.key === 'ot' || col.key === 'dt' ? <input type="checkbox" data-cell={`${ri}:${ci}`} aria-label={`Row ${ri + 1} ${col.label}`} checked={line.laborRate === col.key} disabled={disabled} onFocus={() => setActive([ri, ci])} onChange={e => change(line, col.key, e.currentTarget.checked ? 'TRUE' : 'FALSE')} onBlur={() => { coalesce.current = null; }}/> : <input data-cell={`${ri}:${ci}`} aria-label={`Row ${ri + 1} ${col.label}`} type="text" list={col.key === 'materialMultiplier' ? 'costing-material-multipliers' : undefined} inputMode={col.numeric ? 'decimal' : 'text'} value={cellValue(line, col.key)} disabled={disabled} maxLength={col.key === 'description' ? 500 : 40} onFocus={() => setActive([ri, ci])} onInput={e => change(line, col.key, e.currentTarget.value)} onBlur={() => { coalesce.current = null; }}/>}
    </td>;
                })}<td><Button variant="ghost" onClick={() => details(line.id)}>Details</Button><Button variant="ghost" disabled={disabled} aria-label={`Remove row ${ri + 1}`} onClick={() => commit(lines.filter(l => l.id !== line.id))}>×</Button></td></tr>;
        })}
   </tbody></table>
   {!rows.length && <p class="costing-empty">No {sheet === 'other' ? 'other cost' : sheet} rows. Add a row below to start.</p>}
  </div>
  <footer class="costing-footer"><div class="quote-actions">{(sheet === 'material' ? ['material'] : sheet === 'labor' ? ['technician', 'apprentice', 'after_hours'] : ['service', 'permit', 'license', 'distance', 'fuel', 'subcontractor']).map(kind => <Button key={kind} disabled={disabled || lines.length >= 100} onClick={() => add(kind as EstimateKind)}>+ {estimateLabels[kind as EstimateKind]}</Button>)}</div><span>{lines.length}/100 rows</span></footer>
  <p class="costing-help">{sheet === 'material' ? 'Multiplier adds to base selling price: $100 at 30% = $130. Misc is one flat charge per row, then discount applies to the row subtotal. Inventory cost is separate; use Details to choose material and review cost evidence.' : sheet === 'labor' ? 'OT uses 1.5× and DT uses 2× the base cost and bill rates. Select one premium per row; use separate rows for regular, OT and DT hours. Labor hours are per person.' : 'These job cost categories have no tax under company billing policy.'} Tax and Total come from the server calculation; edits clear stale results.</p>
 </section>;
}
