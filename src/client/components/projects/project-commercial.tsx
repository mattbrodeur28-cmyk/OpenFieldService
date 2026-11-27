import { useState } from "preact/hooks";
import { api } from "../../api";
import { Button } from "../ui/button";
import { TextField } from "../ui/input";
import { Select } from "../ui/select";
import { Badge, Notice } from "../ui/surfaces";
import { Dialog, DialogTitle } from "../ui/dialog";
import { Plus, CheckCircle2, Package, Building2, Receipt, ExternalLink } from "lucide-preact";

const uuid = () => crypto.randomUUID();
const money = (cents?: number | null) => cents == null ? "—" : "$" + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ProjectPurchasingAndSubs({
  projectId, phases, purchasing, subcontractors, canWrite, isApprover, onSaved,
}: {
  projectId: string; phases: any[];
  purchasing: { links: any[]; nativeOrders: any[]; summary: { committedCents: number; receivedCents: number; billedCents: number; openCommitmentCents: number } };
  subcontractors: any[]; canWrite: boolean; isApprover: boolean; onSaved(): void;
}) {
  const [error, setError] = useState("");
  const [purchModal, setPurchModal] = useState(false);
  const [purchForm, setPurchForm] = useState({ description: "", phaseId: "", costCode: "", committed: "0", received: "0", billed: "0", status: "committed" });
  const [subModal, setSubModal] = useState(false);
  const [subForm, setSubForm] = useState({ companyName: "", contactName: "", contactEmail: "", scope: "", phaseId: "", costCode: "", commitment: "0", retainagePct: "10", coiExpiry: "", w9OnFile: false });
  const [invModal, setInvModal] = useState<string | null>(null);
  const [invForm, setInvForm] = useState({ invoiceNumber: "", periodEnd: "", gross: "0", retainage: "0", accountingRef: "" });

  async function savePurch() {
    setError("");
    try {
      await api("POST", `/api/projects/${projectId}/purchasing`, {
        id: uuid(), requestKey: uuid(), phaseId: purchForm.phaseId || null, costCode: purchForm.costCode,
        orderId: null, lineId: null, description: purchForm.description,
        committedCents: Math.round((parseFloat(purchForm.committed) || 0) * 100),
        receivedCents: Math.round((parseFloat(purchForm.received) || 0) * 100),
        billedCents: Math.round((parseFloat(purchForm.billed) || 0) * 100),
        status: purchForm.status, reason: "Recorded project purchasing commitment", reviewAttested: true,
      });
      setPurchModal(false);
      setPurchForm({ description: "", phaseId: "", costCode: "", committed: "0", received: "0", billed: "0", status: "committed" });
      onSaved();
    } catch (e) { setError((e as Error).message); }
  }

  async function saveSub() {
    setError("");
    try {
      await api("POST", `/api/projects/${projectId}/subcontractors`, {
        id: uuid(), requestKey: uuid(), expectedVersion: 0, supplierId: null,
        companyName: subForm.companyName, contactName: subForm.contactName, contactEmail: subForm.contactEmail, contactPhone: "",
        scope: subForm.scope, phaseId: subForm.phaseId || null, costCode: subForm.costCode,
        commitmentCents: Math.round((parseFloat(subForm.commitment) || 0) * 100),
        retainageBps: Math.round((parseFloat(subForm.retainagePct) || 0) * 100),
        coiExpiry: subForm.coiExpiry, licenseExpiry: "", w9OnFile: subForm.w9OnFile, status: "active",
        reason: "Added subcontractor package to project", reviewAttested: true,
      });
      setSubModal(false);
      setSubForm({ companyName: "", contactName: "", contactEmail: "", scope: "", phaseId: "", costCode: "", commitment: "0", retainagePct: "10", coiExpiry: "", w9OnFile: false });
      onSaved();
    } catch (e) { setError((e as Error).message); }
  }

  async function submitSubInv() {
    if (!invModal) return;
    setError("");
    try {
      await api("POST", `/api/projects/${projectId}/subcontractors/${invModal}/invoices`, {
        id: uuid(), requestKey: uuid(), invoiceNumber: invForm.invoiceNumber, periodEnd: invForm.periodEnd,
        grossCents: Math.round((parseFloat(invForm.gross) || 0) * 100),
        retainageCents: Math.round((parseFloat(invForm.retainage) || 0) * 100),
        accountingRef: invForm.accountingRef, reason: "Submitted subcontractor invoice for review", reviewAttested: true,
      });
      setInvModal(null);
      setInvForm({ invoiceNumber: "", periodEnd: "", gross: "0", retainage: "0", accountingRef: "" });
      onSaved();
    } catch (e) { setError((e as Error).message); }
  }

  async function reviewSubInv(invId: string, decision: "approved" | "rejected") {
    setError("");
    try {
      await api("POST", `/api/projects/${projectId}/sub-invoices/${invId}/review`, {
        requestKey: uuid(), decision, reason: `Subcontractor invoice ${decision}`, reviewAttested: true,
      });
      onSaved();
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <div class="project-tab-stack">
      {error && <Notice tone="danger">{error}</Notice>}

      <section class="record-section is-open">
        <div class="record-section-heading">
          <Package size={16} />
          <span class="record-section-title">Purchasing &amp; Material Commitments</span>
          <span class="record-section-count">{purchasing.links.length + purchasing.nativeOrders.length}</span>
        </div>
        <div class="record-section-body">
          <div class="project-pl">
            <div><span>Total Committed</span><strong>{money(purchasing.summary.committedCents)}</strong></div>
            <div><span>Received</span><strong>{money(purchasing.summary.receivedCents)}</strong></div>
            <div><span>Billed</span><strong>{money(purchasing.summary.billedCents)}</strong></div>
            <div><span>Open Commitment</span><strong>{money(purchasing.summary.openCommitmentCents)}</strong></div>
          </div>
          <div class="record-section-toolbar">
            <Button variant="ghost" disabled={!canWrite} onClick={() => setPurchModal(true)}><Plus size={14} /> Add commitment / requisition</Button>
          </div>
          {purchasing.links.length > 0 && (
            <table class="table">
              <thead><tr><th>Description</th><th>Cost Code</th><th>Committed</th><th>Received</th><th>Billed</th><th>Status</th></tr></thead>
              <tbody>{purchasing.links.map((l) => (
                <tr key={l.id}>
                  <th scope="row">{l.description}</th>
                  <td>{l.costCode || "—"}</td>
                  <td>{money(l.committedCents)}</td>
                  <td>{money(l.receivedCents)}</td>
                  <td>{money(l.billedCents)}</td>
                  <td><Badge tone={l.status === "billed" || l.status === "received" ? "success" : "neutral"}>{l.status}</Badge></td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {purchasing.nativeOrders.length > 0 && (
            <>
              <p class="workspace-help">Native Purchase Orders linked via project jobs:</p>
              <table class="table">
                <thead><tr><th>PO #</th><th>Description</th><th>Committed</th><th>Received</th><th>PO Status</th></tr></thead>
                <tbody>{purchasing.nativeOrders.map((n) => (
                  <tr key={n.lineId}>
                    <td>{n.orderNumber}</td>
                    <th scope="row">{n.description}</th>
                    <td>{money(n.committedCents)}</td>
                    <td>{money(n.receivedCents)}</td>
                    <td><Badge tone="info">{n.orderStatus}</Badge></td>
                  </tr>
                ))}</tbody>
              </table>
            </>
          )}
          {!purchasing.links.length && !purchasing.nativeOrders.length && <p class="text-muted">No project purchase commitments yet.</p>}
        </div>
      </section>

      <section class="record-section is-open">
        <div class="record-section-heading">
          <Building2 size={16} />
          <span class="record-section-title">Subcontractors</span>
          <span class="record-section-count">{subcontractors.length}</span>
        </div>
        <div class="record-section-body">
          <div class="record-section-toolbar">
            <Button variant="ghost" disabled={!canWrite} onClick={() => setSubModal(true)}><Plus size={14} /> Add subcontractor</Button>
          </div>
          {subcontractors.length ? (
            <div class="project-sub-list">
              {subcontractors.map((s) => (
                <div class="project-sub-card" key={s.id}>
                  <div class="project-sub-head">
                    <div>
                      <strong>{s.companyName}</strong> <span class="text-muted">{s.scope || s.costCode}</span>
                      <div class="text-muted">Commitment: {money(s.revisedCommitmentCents)} · Invoiced: {money(s.approvedInvoicedCents)} · Retainage: {money(s.retainageHeldCents)} · Remaining: {money(s.remainingCommitmentCents)}</div>
                    </div>
                    <div class="btn-row">
                      {s.complianceWarnings.map((w: string) => <Badge key={w} tone="warning">{w}</Badge>)}
                      <Button variant="ghost" disabled={!canWrite} onClick={() => setInvModal(s.id)}><Plus size={14} /> Submit invoice</Button>
                    </div>
                  </div>
                  {s.invoices.length > 0 && (
                    <table class="table">
                      <thead><tr><th>Invoice #</th><th>Period</th><th>Gross</th><th>Retainage</th><th>Net</th><th>Status</th><th></th></tr></thead>
                      <tbody>{s.invoices.map((i: any) => (
                        <tr key={i.id}>
                          <th scope="row">{i.invoiceNumber}</th>
                          <td>{i.periodEnd || "—"}</td>
                          <td>{money(i.grossCents)}</td>
                          <td>{money(i.retainageCents)}</td>
                          <td>{money(i.netCents)}</td>
                          <td><Badge tone={i.status === "approved" ? "success" : i.status === "rejected" ? "danger" : "warning"}>{i.status}</Badge></td>
                          <td>
                            {isApprover && i.status === "submitted" && (
                              <div class="btn-row">
                                <Button variant="ghost" onClick={() => void reviewSubInv(i.id, "approved")}>Approve</Button>
                                <Button variant="ghost" onClick={() => void reviewSubInv(i.id, "rejected")}>Reject</Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          ) : <p class="text-muted">No subcontractors assigned to this project yet.</p>}
        </div>
      </section>

      {purchModal && (
        <Dialog class="project-form" close={() => setPurchModal(false)}>
          <DialogTitle>Add purchasing commitment</DialogTitle>
          <form class="sales-form" onSubmit={(e) => { e.preventDefault(); void savePurch(); }}>
            <TextField label="Description" value={purchForm.description} onInput={(e) => setPurchForm({ ...purchForm, description: (e.target as HTMLInputElement).value })} />
            {phases.length > 0 && <Select label="Phase (optional)" value={purchForm.phaseId} options={[{ value: "", label: "Project-level" }, ...phases.map((p) => ({ value: p.id, label: p.name }))]} onValueChange={(phaseId) => setPurchForm({ ...purchForm, phaseId })} />}
            <TextField label="Cost code" value={purchForm.costCode} onInput={(e) => setPurchForm({ ...purchForm, costCode: (e.target as HTMLInputElement).value })} />
            <div class="sales-form-grid">
              <TextField label="Committed ($)" type="number" value={purchForm.committed} onInput={(e) => setPurchForm({ ...purchForm, committed: (e.target as HTMLInputElement).value })} />
              <TextField label="Received ($)" type="number" value={purchForm.received} onInput={(e) => setPurchForm({ ...purchForm, received: (e.target as HTMLInputElement).value })} />
            </div>
            <div class="sales-form-grid">
              <TextField label="Billed ($)" type="number" value={purchForm.billed} onInput={(e) => setPurchForm({ ...purchForm, billed: (e.target as HTMLInputElement).value })} />
              <Select label="Status" value={purchForm.status} options={["requisition", "committed", "received", "billed"].map((s) => ({ value: s, label: s }))} onValueChange={(status) => setPurchForm({ ...purchForm, status })} />
            </div>
            <div class="dialog-actions">
              <Button onClick={() => setPurchModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={!purchForm.description.trim()}><CheckCircle2 size={14} /> Save</Button>
            </div>
          </form>
        </Dialog>
      )}

      {subModal && (
        <Dialog class="project-form" close={() => setSubModal(false)}>
          <DialogTitle>Add subcontractor</DialogTitle>
          <form class="sales-form" onSubmit={(e) => { e.preventDefault(); void saveSub(); }}>
            <TextField label="Company name" value={subForm.companyName} onInput={(e) => setSubForm({ ...subForm, companyName: (e.target as HTMLInputElement).value })} />
            <div class="sales-form-grid">
              <TextField label="Contact name" value={subForm.contactName} onInput={(e) => setSubForm({ ...subForm, contactName: (e.target as HTMLInputElement).value })} />
              <TextField label="Contact email" value={subForm.contactEmail} onInput={(e) => setSubForm({ ...subForm, contactEmail: (e.target as HTMLInputElement).value })} />
            </div>
            <TextField label="Scope / package" value={subForm.scope} onInput={(e) => setSubForm({ ...subForm, scope: (e.target as HTMLInputElement).value })} />
            <div class="sales-form-grid">
              <TextField label="Approved commitment ($)" type="number" value={subForm.commitment} onInput={(e) => setSubForm({ ...subForm, commitment: (e.target as HTMLInputElement).value })} />
              <TextField label="Retainage (%)" type="number" value={subForm.retainagePct} onInput={(e) => setSubForm({ ...subForm, retainagePct: (e.target as HTMLInputElement).value })} />
            </div>
            <div class="sales-form-grid">
              <TextField label="Cost code" value={subForm.costCode} onInput={(e) => setSubForm({ ...subForm, costCode: (e.target as HTMLInputElement).value })} />
              <TextField label="COI expiry" type="date" value={subForm.coiExpiry} onInput={(e) => setSubForm({ ...subForm, coiExpiry: (e.target as HTMLInputElement).value })} />
            </div>
            <label class="checkbox-row"><input type="checkbox" checked={subForm.w9OnFile} onChange={(e) => setSubForm({ ...subForm, w9OnFile: (e.target as HTMLInputElement).checked })} /> W-9 on file</label>
            <div class="dialog-actions">
              <Button onClick={() => setSubModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={!subForm.companyName.trim()}><CheckCircle2 size={14} /> Add subcontractor</Button>
            </div>
          </form>
        </Dialog>
      )}

      {invModal && (
        <Dialog class="project-form" close={() => setInvModal(null)}>
          <DialogTitle>Submit subcontractor invoice</DialogTitle>
          <form class="sales-form" onSubmit={(e) => { e.preventDefault(); void submitSubInv(); }}>
            <TextField label="Invoice number" value={invForm.invoiceNumber} onInput={(e) => setInvForm({ ...invForm, invoiceNumber: (e.target as HTMLInputElement).value })} />
            <TextField label="Period end" type="date" value={invForm.periodEnd} onInput={(e) => setInvForm({ ...invForm, periodEnd: (e.target as HTMLInputElement).value })} />
            <div class="sales-form-grid">
              <TextField label="Gross amount ($)" type="number" value={invForm.gross} onInput={(e) => setInvForm({ ...invForm, gross: (e.target as HTMLInputElement).value })} />
              <TextField label="Retainage ($)" type="number" value={invForm.retainage} onInput={(e) => setInvForm({ ...invForm, retainage: (e.target as HTMLInputElement).value })} />
            </div>
            <TextField label="Accounting reference (optional)" value={invForm.accountingRef} onInput={(e) => setInvForm({ ...invForm, accountingRef: (e.target as HTMLInputElement).value })} />
            <div class="dialog-actions">
              <Button onClick={() => setInvModal(null)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={!invForm.invoiceNumber.trim()}><CheckCircle2 size={14} /> Submit</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

export function ProjectProgressBilling({
  projectId, phases, changeOrders, sovLines, billingApps, retainageBps, canWrite, isApprover, onSaved,
}: {
  projectId: string; phases: any[]; changeOrders: any[]; sovLines: any[]; billingApps: any[];
  retainageBps: number; canWrite: boolean; isApprover: boolean; onSaved(): void;
}) {
  const [error, setError] = useState("");
  const [sovModal, setSovModal] = useState(false);
  const [sovForm, setSovForm] = useState({ itemNumber: "", description: "", phaseId: "", costCode: "", scheduledValue: "0", changeOrderId: "" });
  const [appModal, setAppModal] = useState(false);
  const [appPeriod, setAppPeriod] = useState({ start: new Date().toISOString().slice(0, 8) + "01", end: new Date().toISOString().slice(0, 10) });
  const [appLines, setAppLines] = useState<Record<string, { work: string; stored: string }>>({});

  async function saveSov() {
    setError("");
    try {
      await api("POST", `/api/projects/${projectId}/sov`, {
        id: uuid(), requestKey: uuid(), expectedVersion: 0,
        phaseId: sovForm.phaseId || null, costCode: sovForm.costCode,
        itemNumber: sovForm.itemNumber, description: sovForm.description,
        scheduledValueCents: Math.round((parseFloat(sovForm.scheduledValue) || 0) * 100),
        changeOrderId: sovForm.changeOrderId || null, position: sovLines.length + 1,
        reason: "Added Schedule of Values line item", reviewAttested: true,
      });
      setSovModal(false);
      setSovForm({ itemNumber: "", description: "", phaseId: "", costCode: "", scheduledValue: "0", changeOrderId: "" });
      onSaved();
    } catch (e) { setError((e as Error).message); }
  }

  async function createApp() {
    setError("");
    try {
      const lines = sovLines.map((s) => ({
        sovLineId: s.id,
        currentWorkCents: Math.round((parseFloat(appLines[s.id]?.work || "0") || 0) * 100),
        materialsStoredCents: Math.round((parseFloat(appLines[s.id]?.stored || "0") || 0) * 100),
      }));
      await api("POST", `/api/projects/${projectId}/billing-apps`, {
        id: uuid(), requestKey: uuid(), periodStart: appPeriod.start, periodEnd: appPeriod.end,
        retainageBps, lines, reason: "Prepared progress billing application", reviewAttested: true,
      });
      setAppModal(false);
      setAppLines({});
      onSaved();
    } catch (e) { setError((e as Error).message); }
  }

  async function actApp(app: any, action: "review" | "submit" | "return" | "approve" | "record_payment") {
    setError("");
    let paymentCents: number | undefined;
    if (action === "record_payment") {
      const val = window.prompt("Payment received amount ($):", String(((app.currentPaymentDueCents - app.paymentRecordedCents) / 100).toFixed(2)));
      if (!val) return;
      paymentCents = Math.round((parseFloat(val) || 0) * 100);
    }
    try {
      await api("POST", `/api/projects/${projectId}/billing-apps/${app.id}/action`, {
        requestKey: uuid(), expectedVersion: app.version, action, paymentCents,
        reason: `Billing application #${app.applicationNumber} ${action}`, reviewAttested: true,
      });
      onSaved();
    } catch (e) { setError((e as Error).message); }
  }

  const sovTotal = sovLines.reduce((s, l) => s + l.scheduledValueCents, 0);
  const approvedCos = changeOrders.filter((c) => c.status === "approved");
  const phaseById = new Map(phases.map((p) => [p.id, p]));
  const lastApproved = billingApps.find((a) => a.status === "approved") || null;
  const prevBySov = new Map<string, number>((lastApproved?.lines || []).map((l: any) => [l.sovLineId, l.totalCompletedStoredCents || 0]));

  function prefillFromGantt() {
    const next: Record<string, { work: string; stored: string }> = {};
    for (const s of sovLines) {
      const ph = s.phaseId ? phaseById.get(s.phaseId) : null;
      const prevCents = prevBySov.get(s.id) || 0;
      const targetCents = ph ? Math.round((s.scheduledValueCents * (ph.percentComplete || 0)) / 100) : prevCents;
      const deltaCents = Math.max(0, targetCents - prevCents);
      next[s.id] = { work: (deltaCents / 100).toFixed(2), stored: appLines[s.id]?.stored ?? "0" };
    }
    setAppLines(next);
  }

  return (
    <div class="project-tab-stack">
      {error && <Notice tone="danger">{error}</Notice>}

      <section class="record-section is-open">
        <div class="record-section-heading">
          <Receipt size={16} />
          <span class="record-section-title">Schedule of Values (SOV)</span>
          <span class="record-section-count">{sovLines.length}</span>
          <Badge tone="info">Total: {money(sovTotal)}</Badge>
        </div>
        <div class="record-section-body">
          <div class="record-section-toolbar">
            <Button variant="ghost" disabled={!canWrite} onClick={() => setSovModal(true)}><Plus size={14} /> Add SOV line</Button>
          </div>
          {sovLines.length ? (
            <table class="table">
              <thead><tr><th>Item</th><th>Description</th><th>Cost Code</th><th>Scheduled Value</th></tr></thead>
              <tbody>{sovLines.map((l) => (
                <tr key={l.id}>
                  <td>{l.itemNumber}</td>
                  <th scope="row">{l.description}</th>
                  <td>{l.costCode || "—"}</td>
                  <td>{money(l.scheduledValueCents)}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p class="text-muted">Define Schedule of Values lines to enable sequential Commercial/Construction progress billing.</p>}
        </div>
      </section>

      <section class="record-section is-open">
        <div class="record-section-heading">
          <Receipt size={16} />
          <span class="record-section-title">Progress Billing Applications</span>
          <span class="record-section-count">{billingApps.length}</span>
        </div>
        <div class="record-section-body">
          <div class="record-section-toolbar">
            <Button variant="ghost" disabled={!canWrite || !sovLines.length} onClick={() => setAppModal(true)}><Plus size={14} /> New pay application</Button>
          </div>
          {billingApps.length ? (
            <table class="table">
              <thead><tr><th>App #</th><th>Period</th><th>Completed &amp; Stored</th><th>Retainage</th><th>Current Due</th><th>Paid</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{billingApps.map((a) => (
                <tr key={a.id}>
                  <td>#{a.applicationNumber}</td>
                  <td>{a.periodStart} → {a.periodEnd}</td>
                  <td>{money(a.totalCompletedStoredCents)}</td>
                  <td>{money(a.retainageHeldCents)}</td>
                  <td><strong>{money(a.currentPaymentDueCents)}</strong></td>
                  <td>{money(a.paymentRecordedCents)}</td>
                  <td><Badge tone={a.status === "approved" ? "success" : a.status === "returned" ? "danger" : "warning"}>{a.status}</Badge></td>
                  <td>
                    <div class="btn-row">
                      {canWrite && ["draft", "returned"].includes(a.status) && <Button variant="ghost" onClick={() => void actApp(a, "submit")}>Submit</Button>}
                      {isApprover && a.status === "submitted" && <Button variant="ghost" onClick={() => void actApp(a, "approve")}>Approve</Button>}
                      {isApprover && ["in_review", "submitted"].includes(a.status) && <Button variant="ghost" onClick={() => void actApp(a, "return")}>Return</Button>}
                      {isApprover && a.status === "approved" && a.paymentRecordedCents < a.currentPaymentDueCents && <Button variant="ghost" onClick={() => void actApp(a, "record_payment")}>Record payment</Button>}
                      <a class="btn btn-ghost" href={`/api/projects/${projectId}/billing-apps/${a.id}/export`} target="_blank" rel="noopener"><ExternalLink size={13} /> Export</a>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p class="text-muted">No billing applications created yet.</p>}
        </div>
      </section>

      {sovModal && (
        <Dialog class="project-form" close={() => setSovModal(false)}>
          <DialogTitle>Add Schedule of Values line</DialogTitle>
          <form class="sales-form" onSubmit={(e) => { e.preventDefault(); void saveSov(); }}>
            <div class="sales-form-grid">
              <TextField label="Item #" value={sovForm.itemNumber} onInput={(e) => setSovForm({ ...sovForm, itemNumber: (e.target as HTMLInputElement).value })} />
              <TextField label="Cost code" value={sovForm.costCode} onInput={(e) => setSovForm({ ...sovForm, costCode: (e.target as HTMLInputElement).value })} />
            </div>
            <TextField label="Description" value={sovForm.description} onInput={(e) => setSovForm({ ...sovForm, description: (e.target as HTMLInputElement).value })} />
            <TextField label="Scheduled value ($)" type="number" value={sovForm.scheduledValue} onInput={(e) => setSovForm({ ...sovForm, scheduledValue: (e.target as HTMLInputElement).value })} />
            {phases.length > 0 && <Select label="Phase (optional)" value={sovForm.phaseId} options={[{ value: "", label: "Project-level" }, ...phases.map((p) => ({ value: p.id, label: p.name }))]} onValueChange={(phaseId) => setSovForm({ ...sovForm, phaseId })} />}
            {approvedCos.length > 0 && <Select label="Approved Change Order (optional)" value={sovForm.changeOrderId} options={[{ value: "", label: "Original contract" }, ...approvedCos.map((c) => ({ value: c.id, label: `CO-${c.number}: ${c.title}` }))]} onValueChange={(changeOrderId) => setSovForm({ ...sovForm, changeOrderId })} />}
            <div class="dialog-actions">
              <Button onClick={() => setSovModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={!sovForm.itemNumber.trim() || !sovForm.description.trim()}><CheckCircle2 size={14} /> Add SOV line</Button>
            </div>
          </form>
        </Dialog>
      )}

      {appModal && (
        <Dialog class="project-form" close={() => setAppModal(false)}>
          <DialogTitle>New progress billing application</DialogTitle>
          <form class="sales-form" onSubmit={(e) => { e.preventDefault(); void createApp(); }}>
            <div class="sales-form-grid">
              <TextField label="Period start" type="date" value={appPeriod.start} onInput={(e) => setAppPeriod({ ...appPeriod, start: (e.target as HTMLInputElement).value })} />
              <TextField label="Period end" type="date" value={appPeriod.end} onInput={(e) => setAppPeriod({ ...appPeriod, end: (e.target as HTMLInputElement).value })} />
            </div>
            <div class="record-section-toolbar">
              <Button variant="ghost" onClick={prefillFromGantt}>Prefill from Gantt % complete</Button>
            </div>
            <div class="table-scroll">
              <table class="table">
                <thead><tr><th>Item</th><th>Scheduled</th><th>Gantt %</th><th>This Period ($)</th><th>Stored Mat. ($)</th></tr></thead>
                <tbody>{sovLines.map((s) => {
                  const ph = s.phaseId ? phaseById.get(s.phaseId) : null;
                  return (
                    <tr key={s.id}>
                      <td>{s.itemNumber} · {s.description}</td>
                      <td>{money(s.scheduledValueCents)}</td>
                      <td class="text-muted">{ph ? `${ph.percentComplete ?? 0}%` : "—"}</td>
                      <td><input class="project-cost-input" type="number" step="0.01" value={appLines[s.id]?.work ?? "0"} onInput={(e) => setAppLines((p) => ({ ...p, [s.id]: { work: (e.target as HTMLInputElement).value, stored: p[s.id]?.stored ?? "0" } }))} /></td>
                      <td><input class="project-cost-input" type="number" step="0.01" value={appLines[s.id]?.stored ?? "0"} onInput={(e) => setAppLines((p) => ({ ...p, [s.id]: { work: p[s.id]?.work ?? "0", stored: (e.target as HTMLInputElement).value } }))} /></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            <div class="dialog-actions">
              <Button onClick={() => setAppModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit"><CheckCircle2 size={14} /> Create draft application</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
