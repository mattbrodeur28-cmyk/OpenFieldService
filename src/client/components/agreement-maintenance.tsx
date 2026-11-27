import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { accountRequest, useAccount, isAdministrator } from "../auth";
import { useApp } from "../context";
import { useConnectivity } from "../hooks/use-connectivity";
import { Button } from "./ui/button";
import { TextField } from "./ui/input";
import { Select } from "./ui/select";
import { Badge, Notice, Table, Checkbox } from "./ui/surfaces";
import { Dialog, DialogTitle } from "./ui/dialog";
import { Plus, CalendarCheck, Play, SkipForward } from "lucide-preact";

const uuid = () => crypto.randomUUID();
const FREQUENCIES = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
];

export function AgreementMaintenance({
  agreementId, assets, changed,
}: {
  agreementId: string; assets: { id: string; name: string; serialNumber?: string }[]; changed(): void;
}) {
  const { user } = useAccount();
  const { navigate } = useApp();
  const { readOnly } = useConnectivity();
  const admin = isAdministrator(user) && !readOnly;

  const [plans, setPlans] = useState<any[]>([]);
  const [preview, setPreview] = useState<any>(null);
  const [entitlement, setEntitlement] = useState<any>(null);
  const [error, setError] = useState("");
  const [rev, setRev] = useState(0);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: "", frequency: "quarterly", anchorDate: new Date().toISOString().slice(0, 10), assetIds: [] as string[], checklistText: "Inspect filters and belts\nCheck controls sequence", requirePhoto: false, requireReading: true });

  useEffect(() => {
    let live = true;
    setError("");
    void Promise.all([
      accountRequest<{ plans: any[] }>(`/api/agreements/${agreementId}/maintenance/plans`).catch(() => ({ plans: [] })),
      accountRequest<any>(`/api/agreements/${agreementId}/maintenance/preview?horizonDays=90`).catch(() => null),
      accountRequest<any>(`/api/agreements/${agreementId}/entitlement`).catch(() => null),
    ]).then(([p, prev, ent]) => {
      if (!live) return;
      setPlans(p.plans || []);
      setPreview(prev);
      setEntitlement(ent);
    }).catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [agreementId, rev]);

  async function createPlan(e: Event) {
    e.preventDefault();
    setError("");
    const checklist = form.checklistText.split("\n").map((s) => s.trim()).filter(Boolean).map((text) => ({ text, required: true }));
    if (!form.title.trim() || !form.assetIds.length || !checklist.length) {
      setError("Enter a title, select at least one equipment item, and add at least one checklist item.");
      return;
    }
    try {
      await api("POST", `/api/agreements/${agreementId}/maintenance/plans`, {
        id: uuid(), requestKey: uuid(), expectedVersion: 0,
        title: form.title.trim(), frequency: form.frequency, anchorDate: form.anchorDate,
        seasonalMonths: [], assetIds: form.assetIds, checklist,
        requiredEvidence: { checklist: true, photo: form.requirePhoto, reading: form.requireReading, signature: false },
        archived: false, reason: "Configured recurring maintenance plan for agreement",
      });
      setModal(false);
      setRev((r) => r + 1);
      changed();
    } catch (err) { setError((err as Error).message); }
  }

  async function generateOccurrence(occ: any) {
    setError("");
    try {
      await api("POST", `/api/agreements/${agreementId}/maintenance/generate`, {
        requestKey: uuid(), planId: occ.planId, planVersion: occ.planVersion,
        assetId: occ.assetId, dueDate: occ.dueDate,
        reason: "Generated native PM job from maintenance plan preview",
      });
      setRev((r) => r + 1);
      changed();
    } catch (err) { setError((err as Error).message); }
  }

  async function skipOccurrence(occ: any) {
    const why = window.prompt("Audit reason for skipping this occurrence (at least 10 chars):");
    if (!why || why.trim().length < 10) return;
    setError("");
    try {
      await api("POST", `/api/agreements/${agreementId}/maintenance/skip`, {
        requestKey: uuid(), planId: occ.planId, planVersion: occ.planVersion,
        assetId: occ.assetId, dueDate: occ.dueDate, reason: why.trim(),
      });
      setRev((r) => r + 1);
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <div class="project-tab-stack">
      {error && <Notice tone="danger">{error}</Notice>}

      {entitlement && (
        <section class="detail-section">
          <h3>Entitlement &amp; Coverage Usage</h3>
          <div class="project-pl">
            <div><span>Billing Entitlement</span><strong>{entitlement.billingEntitlement || "Unknown"}</strong></div>
            <div><span>Included Visits</span><strong>{entitlement.includedVisits ?? "Unconfigured"}</strong></div>
            <div><span>Used Visits</span><strong>{entitlement.usedVisits ?? 0}</strong></div>
            <div><span>Included Hours</span><strong>{entitlement.includedHours ?? "Unconfigured"}</strong></div>
            <div><span>Used Hours</span><strong>{entitlement.usedHours ?? 0}</strong></div>
            <div><span>Response Priority</span><strong>{entitlement.responsePriority || "Standard"}</strong></div>
          </div>
        </section>
      )}

      <section class="detail-section">
        <div class="agreement-actions" style={{ justifyContent: "space-between" }}>
          <h3>Maintenance Plans</h3>
          {admin && <Button variant="primary" onClick={() => setModal(true)}><Plus size={14} /> Add maintenance plan</Button>}
        </div>
        {plans.length ? (
          <Table label="Maintenance plans">
            <thead><tr><th>Plan</th><th>Frequency</th><th>Anchor</th><th>Equipment</th><th>Checklist</th><th>Rev</th></tr></thead>
            <tbody>{plans.map((p) => (
              <tr key={p.id}>
                <th scope="row">{p.title}</th>
                <td><Badge>{p.frequency}</Badge></td>
                <td>{p.anchorDate}</td>
                <td>{p.assetIds?.length ?? 0}</td>
                <td>{p.checklist?.length ?? 0} items</td>
                <td>v{p.version}</td>
              </tr>
            ))}</tbody>
          </Table>
        ) : <p class="text-muted">No recurring maintenance plans configured yet.</p>}
      </section>

      <section class="detail-section">
        <h3><CalendarCheck size={15} style={{ marginRight: "6px" }} />Due Work Preview — Next 90 Days</h3>
        {preview?.occurrences?.length ? (
          <Table label="Due maintenance occurrences">
            <thead><tr><th>Due Date</th><th>Scheduled</th><th>Plan</th><th>Equipment</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{preview.occurrences.map((o: any) => (
              <tr key={`${o.planId}:${o.assetId}:${o.dueDate}`}>
                <td>{o.dueDate}</td>
                <td>{o.scheduledDate || o.dueDate}</td>
                <th scope="row">{o.planTitle || o.planId}</th>
                <td>{assets.find((a) => a.id === o.assetId)?.name || o.assetId}</td>
                <td><Badge tone={o.status === "generated" ? "success" : o.status === "skipped" ? "neutral" : "warning"}>{o.status}</Badge></td>
                <td>
                  <div class="btn-row">
                    {o.jobId && <Button variant="ghost" onClick={() => navigate(`/jobs/${o.jobId}`)}>Open job</Button>}
                    {admin && o.status === "due" && (
                      <>
                        <Button variant="ghost" onClick={() => void generateOccurrence(o)}><Play size={13} /> Generate PM job</Button>
                        <Button variant="ghost" onClick={() => void skipOccurrence(o)}><SkipForward size={13} /> Skip</Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </Table>
        ) : <p class="text-muted">{preview?.reason || "No due maintenance occurrences in the next 90 days (requires an active authorized term and maintenance plan)."}</p>}
      </section>

      {modal && (
        <Dialog class="project-form" close={() => setModal(false)}>
          <DialogTitle>New maintenance plan</DialogTitle>
          <form class="sales-form" onSubmit={createPlan}>
            <TextField label="Plan title" value={form.title} onInput={(e) => setForm({ ...form, title: (e.target as HTMLInputElement).value })} />
            <div class="sales-form-grid">
              <Select label="Frequency" value={form.frequency} options={FREQUENCIES} onValueChange={(frequency) => setForm({ ...form, frequency })} />
              <TextField label="Anchor date" type="date" value={form.anchorDate} onInput={(e) => setForm({ ...form, anchorDate: (e.target as HTMLInputElement).value })} />
            </div>
            <div>
              <strong style={{ fontSize: "12px" }}>Covered equipment</strong>
              {assets.map((a) => (
                <Checkbox key={a.id} label={`${a.name}${a.serialNumber ? ` · ${a.serialNumber}` : ""}`} checked={form.assetIds.includes(a.id)} onChange={(e) => setForm((f) => ({ ...f, assetIds: e.currentTarget.checked ? [...f.assetIds, a.id] : f.assetIds.filter((x) => x !== a.id) }))} />
              ))}
            </div>
            <label class="ui-field"><span>Checklist (one item per line)</span><textarea rows={3} value={form.checklistText} onInput={(e) => setForm({ ...form, checklistText: (e.target as HTMLTextAreaElement).value })} /></label>
            <div class="btn-row">
              <Checkbox label="Require photo evidence" checked={form.requirePhoto} onChange={(e) => setForm({ ...form, requirePhoto: e.currentTarget.checked })} />
              <Checkbox label="Require readings" checked={form.requireReading} onChange={(e) => setForm({ ...form, requireReading: e.currentTarget.checked })} />
            </div>
            <div class="dialog-actions">
              <Button onClick={() => setModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit">Save plan</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
