import { useEffect, useState } from "preact/hooks";
import { api } from "../../api";
import { Button } from "../ui/button";
import { Select } from "../ui/select";
import { Badge, Notice } from "../ui/surfaces";
import { BarChart3, ShieldCheck, Camera } from "lucide-preact";

const uuid = () => crypto.randomUUID();
const money = (cents?: number | null) => cents == null ? "—" : "$" + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ProjectWipAndAudit({
  projectId, initialWip, snapshots, isApprover, onSaved,
}: {
  projectId: string; initialWip: any; snapshots: any[]; isApprover: boolean; onSaved(): void;
}) {
  const [method, setMethod] = useState<"cost_to_cost" | "phase_progress">("cost_to_cost");
  const [wip, setWip] = useState<any>(initialWip);
  const [auditRows, setAuditRows] = useState<any[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setWip(initialWip);
  }, [initialWip]);

  useEffect(() => {
    let live = true;
    void api<{ rows: any[] }>("GET", `/api/projects/${projectId}/audit`)
      .then((res) => { if (live) setAuditRows(res.rows); })
      .catch(() => {});
    return () => { live = false; };
  }, [projectId, snapshots.length]);

  async function switchMethod(next: string) {
    const m = next === "phase_progress" ? "phase_progress" : "cost_to_cost";
    setMethod(m);
    setError("");
    try {
      const res = await api<{ wip: any }>("GET", `/api/projects/${projectId}/wip?method=${m}`);
      setWip(res.wip);
    } catch (e) { setError((e as Error).message); }
  }

  async function approveSnapshot() {
    setError("");
    try {
      await api("POST", `/api/projects/${projectId}/wip/snapshots`, {
        id: uuid(), requestKey: uuid(), asOfDate: new Date().toISOString().slice(0, 10),
        method, correctionOf: null, reason: "Approved period WIP reporting snapshot", reviewAttested: true,
      });
      onSaved();
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <div class="project-tab-stack">
      {error && <Notice tone="danger">{error}</Notice>}

      <section class="record-section is-open">
        <div class="record-section-heading">
          <BarChart3 size={16} />
          <span class="record-section-title">Work-in-Progress (WIP) Report</span>
          <Badge tone="info">{wip.percentComplete}% complete</Badge>
        </div>
        <div class="record-section-body">
          <div class="project-wip-toolbar">
            <Select label="Method" value={method} options={[{ value: "cost_to_cost", label: "Cost-to-cost" }, { value: "phase_progress", label: "Phase progress" }]} onValueChange={(v) => void switchMethod(v)} />
            {isApprover && <Button variant="primary" onClick={() => void approveSnapshot()}><Camera size={14} /> Lock period WIP snapshot</Button>}
          </div>
          <p class="workspace-help">{wip.note} Computed: {wip.computedAt?.slice(0, 19).replace("T", " ")} UTC.</p>
          <div class="project-pl">
            <div><span>Original Contract</span><strong>{money(wip.contractValueCents)}</strong></div>
            <div><span>Approved Changes</span><strong>{money(wip.approvedChangesCents)}</strong></div>
            <div><span>Revised Contract</span><strong>{money(wip.revisedContractCents)}</strong></div>
            <div><span>Earned Revenue</span><strong>{money(wip.earnedRevenueCents)}</strong></div>
            <div><span>Actual Cost</span><strong>{money(wip.actualCostCents)}</strong></div>
            <div><span>Open Committed</span><strong>{money(wip.committedCostCents)}</strong></div>
            <div><span>Estimate to Complete</span><strong>{money(wip.estimateToCompleteCents)}</strong></div>
            <div><span>Forecast at Completion</span><strong>{money(wip.forecastAtCompletionCents)}</strong></div>
            <div><span>Billed to Date</span><strong>{money(wip.billedToDateCents)}</strong></div>
            <div><span>{wip.overUnderBillingCents >= 0 ? "Over-billed (Liability)" : "Under-billed (Asset)"}</span><strong class={wip.overUnderBillingCents < 0 ? "project-margin-neg" : "project-margin-pos"}>{money(Math.abs(wip.overUnderBillingCents))}</strong></div>
            <div><span>AR Retainage Held</span><strong>{money(wip.retainageHeldCents)}</strong></div>
            <div><span>Est. Gross Profit</span><strong class={wip.estimatedGrossProfitCents < 0 ? "project-margin-neg" : "project-margin-pos"}>{money(wip.estimatedGrossProfitCents)}</strong></div>
          </div>

          <p class="workspace-help">Source breakdown: Crew labor {money(wip.sources?.crewLaborCents)} · Subcontractor invoices {money(wip.sources?.subActualCents)} · Purchasing actual {money(wip.sources?.purchActualCents)} · Linked job invoices {money(wip.sources?.linkedJobActualCents)}.</p>

          {snapshots.length > 0 && (
            <>
              <h3>Approved Period Snapshots</h3>
              <table class="table">
                <thead><tr><th>As Of</th><th>Method</th><th>Revised Contract</th><th>%</th><th>Earned Rev.</th><th>Actual Cost</th><th>Billed</th><th>Over/Under</th></tr></thead>
                <tbody>{snapshots.map((s) => (
                  <tr key={s.id}>
                    <td>{s.asOfDate}</td>
                    <td>{s.method}</td>
                    <td>{money(s.revisedContractCents)}</td>
                    <td>{(s.percentCompleteBps / 100).toFixed(1)}%</td>
                    <td>{money(s.earnedRevenueCents)}</td>
                    <td>{money(s.actualCostCents)}</td>
                    <td>{money(s.billedToDateCents)}</td>
                    <td>{money(s.overUnderBillingCents)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </>
          )}
        </div>
      </section>

      <section class="record-section is-open">
        <div class="record-section-heading">
          <ShieldCheck size={16} />
          <span class="record-section-title">Project Audit Trail</span>
          <span class="record-section-count">{auditRows?.length ?? 0}</span>
        </div>
        <div class="record-section-body">
          {auditRows === null ? <p class="text-muted">Loading audit history…</p> : auditRows.length ? (
            <table class="table">
              <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Reason</th></tr></thead>
              <tbody>{auditRows.map((a) => (
                <tr key={a.id}>
                  <td class="text-muted">{a.createdAt}</td>
                  <td>{a.actorId}</td>
                  <td><Badge tone="neutral">{a.action}</Badge></td>
                  <td>{a.entityType}</td>
                  <td class="text-muted">{a.reason}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p class="text-muted">No audited changes recorded yet.</p>}
        </div>
      </section>
    </div>
  );
}
