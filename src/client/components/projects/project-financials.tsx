import { useState } from "preact/hooks";
import { api } from "../../api";
import { Button } from "../ui/button";
import { Plus, Trash2 } from "lucide-preact";

const DEFAULT_SECTIONS = ["PM Hours", "Tech Hours", "Graphics", "Sales", "Material"];
const reason = "Reviewed project job costing";
const money = (cents: number) => "$" + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const uuid = () => crypto.randomUUID();

type Section = { id: string; name: string; position: number; quantityMilli: number; costRateCents: number; billRateCents: number; costCents: number; billCents: number; marginCents: number };
type ProfitLoss = { totalCostCents: number; totalBillableCents: number; profitCents: number; marginPercent: number | null };

export function ProjectFinancials({ projectId, sections, profitLoss, canWrite, onSaved }: { projectId: string; sections: Section[]; profitLoss: ProfitLoss; canWrite: boolean; onSaved(): void }) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [edits, setEdits] = useState<Record<string, { quantity: string; cost: string; bill: string }>>({});

  const values = (s: Section) => edits[s.id] || { quantity: String(s.quantityMilli / 1000), cost: (s.costRateCents / 100).toFixed(2), bill: (s.billRateCents / 100).toFixed(2) };
  const setValue = (s: Section, field: "quantity" | "cost" | "bill", value: string) => setEdits((e) => ({ ...e, [s.id]: { ...values(s), [field]: value } }));

  async function saveSection(s: Section) {
    if (!canWrite || !edits[s.id]) return;
    const e = values(s);
    setError("");
    try {
      await api("POST", `/api/projects/${projectId}/cost-sections`, {
        id: s.id, requestKey: uuid(), name: s.name, position: s.position,
        quantityMilli: Math.round((parseFloat(e.quantity) || 0) * 1000),
        costRateCents: Math.round((parseFloat(e.cost) || 0) * 100),
        billRateCents: Math.round((parseFloat(e.bill) || 0) * 100),
        reason, reviewAttested: true,
      });
      setEdits((prev) => { const next = { ...prev }; delete next[s.id]; return next; });
      onSaved();
    } catch (err) { setError((err as Error).message); }
  }

  async function addSection(name: string) {
    if (!name.trim()) return;
    setError("");
    try {
      await api("POST", `/api/projects/${projectId}/cost-sections`, { id: uuid(), requestKey: uuid(), name: name.trim(), position: sections.length + 1, quantityMilli: 0, costRateCents: 0, billRateCents: 0, reason, reviewAttested: true });
      setNewName("");
      onSaved();
    } catch (err) { setError((err as Error).message); }
  }

  async function removeSection(s: Section) {
    setError("");
    try { await api("DELETE", `/api/projects/${projectId}/cost-sections/${s.id}`); onSaved(); }
    catch (err) { setError((err as Error).message); }
  }

  async function seedDefaults() {
    setError("");
    for (const [i, name] of DEFAULT_SECTIONS.entries()) {
      await api("POST", `/api/projects/${projectId}/cost-sections`, { id: uuid(), requestKey: uuid(), name, position: i + 1, quantityMilli: 0, costRateCents: 0, billRateCents: 0, reason, reviewAttested: true }).catch(() => {});
    }
    onSaved();
  }

  return (
    <div class="project-financials">
      {error && <p class="workspace-error" role="alert">{error}</p>}
      {!sections.length ? (
        <div class="project-financials-empty">
          <p class="workspace-help">Add job-costing sections (PM Hours, Tech Hours, Graphics, Sales, Material) to compare cost against billable and see the P&amp;L.</p>
          <Button disabled={!canWrite} onClick={() => void seedDefaults()}><Plus size={14} /> Add default sections</Button>
        </div>
      ) : (
        <div class="table-scroll">
          <table class="table project-costing-table">
            <thead><tr><th>Section</th><th>Hours / Units</th><th>Cost rate</th><th>Cost</th><th>Bill rate</th><th>Billable</th><th>Margin</th><th></th></tr></thead>
            <tbody>{sections.map((s) => {
              const v = values(s);
              return (
                <tr key={s.id}>
                  <th scope="row">{s.name}</th>
                  <td><input class="project-cost-input" type="number" step="0.25" value={v.quantity} disabled={!canWrite} onInput={(ev) => setValue(s, "quantity", (ev.target as HTMLInputElement).value)} onBlur={() => void saveSection(s)} /></td>
                  <td><input class="project-cost-input" type="number" step="0.01" value={v.cost} disabled={!canWrite} onInput={(ev) => setValue(s, "cost", (ev.target as HTMLInputElement).value)} onBlur={() => void saveSection(s)} /></td>
                  <td>{money(s.costCents)}</td>
                  <td><input class="project-cost-input" type="number" step="0.01" value={v.bill} disabled={!canWrite} onInput={(ev) => setValue(s, "bill", (ev.target as HTMLInputElement).value)} onBlur={() => void saveSection(s)} /></td>
                  <td>{money(s.billCents)}</td>
                  <td class={s.marginCents < 0 ? "project-margin-neg" : "project-margin-pos"}>{money(s.marginCents)}</td>
                  <td>{canWrite && <button type="button" class="btn-icon danger" aria-label={`Remove ${s.name}`} onClick={() => void removeSection(s)}><Trash2 size={13} /></button>}</td>
                </tr>
              );
            })}</tbody>
            <tfoot>
              <tr><th scope="row">Total</th><td></td><td></td><td>{money(profitLoss.totalCostCents)}</td><td></td><td>{money(profitLoss.totalBillableCents)}</td><td class={profitLoss.profitCents < 0 ? "project-margin-neg" : "project-margin-pos"}>{money(profitLoss.profitCents)}</td><td></td></tr>
            </tfoot>
          </table>
        </div>
      )}

      {!!sections.length && (
        <div class="project-pl">
          <div><span>Total billable</span><strong>{money(profitLoss.totalBillableCents)}</strong></div>
          <div><span>Total cost</span><strong>{money(profitLoss.totalCostCents)}</strong></div>
          <div><span>Profit</span><strong class={profitLoss.profitCents < 0 ? "project-margin-neg" : "project-margin-pos"}>{money(profitLoss.profitCents)}</strong></div>
          <div><span>Margin</span><strong class={profitLoss.profitCents < 0 ? "project-margin-neg" : "project-margin-pos"}>{profitLoss.marginPercent == null ? "—" : `${profitLoss.marginPercent}%`}</strong></div>
        </div>
      )}

      {canWrite && (
        <div class="project-financials-add">
          <input placeholder="Add section (e.g. Subcontractor)" value={newName} onInput={(e) => setNewName((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addSection(newName); } }} />
          <Button disabled={!newName.trim()} onClick={() => void addSection(newName)}><Plus size={14} /> Add</Button>
        </div>
      )}
    </div>
  );
}
