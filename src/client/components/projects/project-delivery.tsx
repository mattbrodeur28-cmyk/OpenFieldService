import { useState } from "preact/hooks";
import { api } from "../../api";
import { Button } from "../ui/button";
import { TextField } from "../ui/input";
import { Select } from "../ui/select";
import { Badge, Notice } from "../ui/surfaces";
import { Dialog, DialogTitle } from "../ui/dialog";
import { Plus, CheckCircle2, FileText, Users, Clock, FileDiff } from "lucide-preact";

const uuid = () => crypto.randomUUID();
const money = (cents?: number | null) => cents == null ? "—" : "$" + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DOC_TYPES = [
  { value: "daily_log", label: "Daily log" },
  { value: "completion_evidence", label: "Completion evidence" },
  { value: "form", label: "Field form" },
  { value: "photo", label: "Photo record" },
  { value: "signature", label: "Approval signature" },
  { value: "attachment", label: "Attachment" },
];

export function ProjectFieldAndCrews({
  projectId, phases, jobs, technicians, fieldDocs, billingReadiness, crews, crewTime, canWrite, isApprover, onSaved,
}: {
  projectId: string; phases: any[]; jobs: any[]; technicians: any[];
  fieldDocs: any[]; billingReadiness: { requiredCount: number; approvedCount: number; ready: boolean };
  crews: any[]; crewTime: any[]; canWrite: boolean; isApprover: boolean; onSaved(): void;
}) {
  const [error, setError] = useState("");
  const [docModal, setDocModal] = useState(false);
  const [docForm, setDocForm] = useState({ docType: "daily_log", title: "", body: "", phaseId: "", jobId: "", billingRequired: false, signatureName: "", signatureIntent: "" });
  const [crewModal, setCrewModal] = useState(false);
  const [crewForm, setCrewForm] = useState({ name: "", leadTechnicianId: "", costCode: "" });
  const [timeModal, setTimeModal] = useState(false);
  const [timeForm, setTimeForm] = useState({ crewId: "", technicianId: "", phaseId: "", jobId: "", costCode: "", workDate: new Date().toISOString().slice(0, 10), hours: "8", hourlyCost: "65", notes: "" });

  async function saveDoc() {
    setError("");
    try {
      await api("POST", `/api/projects/${projectId}/field-docs`, {
        id: uuid(), requestKey: uuid(), expectedVersion: 0,
        phaseId: docForm.phaseId || null, jobId: docForm.jobId || null,
        docType: docForm.docType, title: docForm.title, body: docForm.body, documentId: null,
        billingRequired: docForm.billingRequired, status: "submitted",
        signatureName: docForm.signatureName, signatureIntent: docForm.signatureIntent,
        reason: "Recorded field documentation on project", reviewAttested: true,
      });
      setDocModal(false);
      setDocForm({ docType: "daily_log", title: "", body: "", phaseId: "", jobId: "", billingRequired: false, signatureName: "", signatureIntent: "" });
      onSaved();
    } catch (e) { setError((e as Error).message); }
  }

  async function approveDoc(doc: any) {
    setError("");
    try {
      await api("POST", `/api/projects/${projectId}/field-docs`, {
        id: doc.id, requestKey: uuid(), expectedVersion: doc.version,
        phaseId: doc.phaseId || null, jobId: doc.jobId || null,
        docType: doc.docType, title: doc.title, body: doc.body || "", documentId: doc.documentId || null,
        billingRequired: !!doc.billingRequired, status: "approved",
        signatureName: doc.signatureName || "", signatureIntent: doc.signatureIntent || "",
        reason: "Approved field documentation for billing readiness", reviewAttested: true,
      });
      onSaved();
    } catch (e) { setError((e as Error).message); }
  }

  async function saveCrew() {
    setError("");
    try {
      await api("POST", `/api/projects/${projectId}/crews`, {
        id: uuid(), requestKey: uuid(), expectedVersion: 0,
        name: crewForm.name, leadTechnicianId: crewForm.leadTechnicianId || null,
        costCode: crewForm.costCode, active: true,
        reason: "Added project crew assignment", reviewAttested: true,
      });
      setCrewModal(false);
      setCrewForm({ name: "", leadTechnicianId: "", costCode: "" });
      onSaved();
    } catch (e) { setError((e as Error).message); }
  }

  async function saveTime() {
    setError("");
    try {
      await api("POST", `/api/projects/${projectId}/crew-time`, {
        id: uuid(), requestKey: uuid(),
        crewId: timeForm.crewId || null, technicianId: timeForm.technicianId,
        jobId: timeForm.jobId || null, phaseId: timeForm.phaseId || null,
        costCode: timeForm.costCode, workDate: timeForm.workDate,
        hoursMilli: Math.round((parseFloat(timeForm.hours) || 0) * 1000),
        hourlyCostCents: Math.round((parseFloat(timeForm.hourlyCost) || 0) * 100),
        notes: timeForm.notes, correctionOf: null,
        reason: "Submitted project field time entry", reviewAttested: true,
      });
      setTimeModal(false);
      onSaved();
    } catch (e) { setError((e as Error).message); }
  }

  async function reviewTime(timeId: string, decision: "approved" | "rejected") {
    setError("");
    try {
      await api("POST", `/api/projects/${projectId}/crew-time/${timeId}/review`, {
        requestKey: uuid(), decision, reason: `Supervisor ${decision} field time entry`, reviewAttested: true,
      });
      onSaved();
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <div class="project-tab-stack">
      {error && <Notice tone="danger">{error}</Notice>}

      <section class="record-section is-open">
        <div class="record-section-heading">
          <FileText size={16} />
          <span class="record-section-title">Field Documentation &amp; Daily Logs</span>
          <span class="record-section-count">{fieldDocs.length}</span>
          <Badge tone={billingReadiness.ready ? "success" : "warning"}>
            {billingReadiness.requiredCount ? `Billing evidence: ${billingReadiness.approvedCount}/${billingReadiness.requiredCount} approved` : "No billing gates"}
          </Badge>
        </div>
        <div class="record-section-body">
          <div class="record-section-toolbar">
            <Button variant="ghost" disabled={!canWrite} onClick={() => setDocModal(true)}><Plus size={14} /> Add field record</Button>
          </div>
          {fieldDocs.length ? (
            <table class="table">
              <thead><tr><th>Type</th><th>Title</th><th>Billing Gate</th><th>Status</th><th>Signer / Notes</th><th></th></tr></thead>
              <tbody>{fieldDocs.map((d) => (
                <tr key={d.id}>
                  <td>{DOC_TYPES.find((t) => t.value === d.docType)?.label || d.docType}</td>
                  <th scope="row">{d.title}</th>
                  <td>{d.billingRequired ? <Badge tone="warning">Required</Badge> : <span class="text-muted">Optional</span>}</td>
                  <td><Badge tone={d.status === "approved" ? "success" : d.status === "rejected" ? "danger" : "neutral"}>{d.status}</Badge></td>
                  <td class="text-muted">{d.signatureName ? `${d.signatureName} — ${d.signatureIntent}` : (d.body || "—").slice(0, 80)}</td>
                  <td>{isApprover && d.status !== "approved" && <Button variant="ghost" onClick={() => void approveDoc(d)}>Approve</Button>}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p class="text-muted">No daily logs, forms, signatures, or completion evidence recorded yet.</p>}
        </div>
      </section>

      <section class="record-section is-open">
        <div class="record-section-heading">
          <Users size={16} />
          <span class="record-section-title">Crews</span>
          <span class="record-section-count">{crews.length}</span>
        </div>
        <div class="record-section-body">
          <div class="record-section-toolbar">
            <Button variant="ghost" disabled={!canWrite} onClick={() => setCrewModal(true)}><Plus size={14} /> Add crew</Button>
          </div>
          {crews.length ? (
            <table class="table">
              <thead><tr><th>Crew</th><th>Lead</th><th>Cost Code</th><th>Members</th><th>Status</th></tr></thead>
              <tbody>{crews.map((c) => (
                <tr key={c.id}>
                  <th scope="row">{c.name}</th>
                  <td class="text-muted">{c.leadName || "—"}</td>
                  <td>{c.costCode || "—"}</td>
                  <td>{c.members.length}</td>
                  <td><Badge tone={c.active ? "success" : "neutral"}>{c.active ? "Active" : "Inactive"}</Badge></td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p class="text-muted">No crews assigned to this project yet.</p>}
        </div>
      </section>

      <section class="record-section is-open">
        <div class="record-section-heading">
          <Clock size={16} />
          <span class="record-section-title">Field Time &amp; Labor Allocation</span>
          <span class="record-section-count">{crewTime.length}</span>
        </div>
        <div class="record-section-body">
          <div class="record-section-toolbar">
            <Button variant="ghost" disabled={!canWrite || !technicians.length} onClick={() => setTimeModal(true)}><Plus size={14} /> Log field time</Button>
          </div>
          {crewTime.length ? (
            <table class="table">
              <thead><tr><th>Date</th><th>Technician</th><th>Cost Code</th><th>Hours</th><th>Labor Cost</th><th>Status</th><th></th></tr></thead>
              <tbody>{crewTime.map((t) => (
                <tr key={t.id}>
                  <td>{t.workDate}</td>
                  <th scope="row">{t.technicianName}</th>
                  <td>{t.costCode || "—"}</td>
                  <td>{(t.hoursMilli / 1000).toFixed(2)}</td>
                  <td>{money(t.laborCostCents)}</td>
                  <td><Badge tone={t.status === "approved" ? "success" : t.status === "rejected" ? "danger" : "neutral"}>{t.status}</Badge></td>
                  <td>
                    {isApprover && t.status === "submitted" && (
                      <div class="btn-row">
                        <Button variant="ghost" onClick={() => void reviewTime(t.id, "approved")}>Approve</Button>
                        <Button variant="ghost" onClick={() => void reviewTime(t.id, "rejected")}>Reject</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p class="text-muted">No field time logged for this project yet.</p>}
        </div>
      </section>

      {docModal && (
        <Dialog class="project-form" close={() => setDocModal(false)}>
          <DialogTitle>Add field documentation</DialogTitle>
          <form class="sales-form" onSubmit={(e) => { e.preventDefault(); void saveDoc(); }}>
            <Select label="Type" value={docForm.docType} options={DOC_TYPES} onValueChange={(docType) => setDocForm({ ...docForm, docType })} />
            <TextField label="Title" value={docForm.title} onInput={(e) => setDocForm({ ...docForm, title: (e.target as HTMLInputElement).value })} />
            {phases.length > 0 && <Select label="Phase (optional)" value={docForm.phaseId} options={[{ value: "", label: "Project-level" }, ...phases.map((p) => ({ value: p.id, label: p.name }))]} onValueChange={(phaseId) => setDocForm({ ...docForm, phaseId })} />}
            {jobs.length > 0 && <Select label="Linked job (optional)" value={docForm.jobId} options={[{ value: "", label: "None" }, ...jobs.map((j) => ({ value: j.jobId, label: j.identifier }))]} onValueChange={(jobId) => setDocForm({ ...docForm, jobId })} />}
            <label class="ui-field"><span>Notes / Log Details</span><textarea rows={3} value={docForm.body} onInput={(e) => setDocForm({ ...docForm, body: (e.target as HTMLTextAreaElement).value })} /></label>
            {docForm.docType === "signature" && (
              <>
                <TextField label="Signer name" value={docForm.signatureName} onInput={(e) => setDocForm({ ...docForm, signatureName: (e.target as HTMLInputElement).value })} />
                <TextField label="Stated approval intent" value={docForm.signatureIntent} onInput={(e) => setDocForm({ ...docForm, signatureIntent: (e.target as HTMLInputElement).value })} />
              </>
            )}
            <label class="checkbox-row"><input type="checkbox" checked={docForm.billingRequired} onChange={(e) => setDocForm({ ...docForm, billingRequired: (e.target as HTMLInputElement).checked })} /> Required for progress billing submission</label>
            <div class="dialog-actions">
              <Button onClick={() => setDocModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={!docForm.title.trim()}><CheckCircle2 size={14} /> Save</Button>
            </div>
          </form>
        </Dialog>
      )}

      {crewModal && (
        <Dialog class="project-form" close={() => setCrewModal(false)}>
          <DialogTitle>Add project crew</DialogTitle>
          <form class="sales-form" onSubmit={(e) => { e.preventDefault(); void saveCrew(); }}>
            <TextField label="Crew name" value={crewForm.name} onInput={(e) => setCrewForm({ ...crewForm, name: (e.target as HTMLInputElement).value })} />
            <Select label="Crew lead" value={crewForm.leadTechnicianId} options={[{ value: "", label: "Unassigned" }, ...technicians.map((t) => ({ value: t.id, label: t.name }))]} onValueChange={(leadTechnicianId) => setCrewForm({ ...crewForm, leadTechnicianId })} />
            <TextField label="Cost code" value={crewForm.costCode} onInput={(e) => setCrewForm({ ...crewForm, costCode: (e.target as HTMLInputElement).value })} />
            <div class="dialog-actions">
              <Button onClick={() => setCrewModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={!crewForm.name.trim()}><CheckCircle2 size={14} /> Save crew</Button>
            </div>
          </form>
        </Dialog>
      )}

      {timeModal && (
        <Dialog class="project-form" close={() => setTimeModal(false)}>
          <DialogTitle>Log field time</DialogTitle>
          <form class="sales-form" onSubmit={(e) => { e.preventDefault(); void saveTime(); }}>
            <Select label="Technician" value={timeForm.technicianId} options={technicians.map((t) => ({ value: t.id, label: t.name }))} onValueChange={(technicianId) => setTimeForm({ ...timeForm, technicianId })} />
            {crews.length > 0 && <Select label="Crew (optional)" value={timeForm.crewId} options={[{ value: "", label: "None" }, ...crews.map((c) => ({ value: c.id, label: c.name }))]} onValueChange={(crewId) => setTimeForm({ ...timeForm, crewId })} />}
            {phases.length > 0 && <Select label="Phase (optional)" value={timeForm.phaseId} options={[{ value: "", label: "Project-level" }, ...phases.map((p) => ({ value: p.id, label: p.name }))]} onValueChange={(phaseId) => setTimeForm({ ...timeForm, phaseId })} />}
            <div class="sales-form-grid">
              <TextField label="Work date" type="date" value={timeForm.workDate} onInput={(e) => setTimeForm({ ...timeForm, workDate: (e.target as HTMLInputElement).value })} />
              <TextField label="Cost code" value={timeForm.costCode} onInput={(e) => setTimeForm({ ...timeForm, costCode: (e.target as HTMLInputElement).value })} />
            </div>
            <div class="sales-form-grid">
              <TextField label="Hours" type="number" value={timeForm.hours} onInput={(e) => setTimeForm({ ...timeForm, hours: (e.target as HTMLInputElement).value })} />
              <TextField label="Hourly cost ($)" type="number" value={timeForm.hourlyCost} onInput={(e) => setTimeForm({ ...timeForm, hourlyCost: (e.target as HTMLInputElement).value })} />
            </div>
            <TextField label="Notes" value={timeForm.notes} onInput={(e) => setTimeForm({ ...timeForm, notes: (e.target as HTMLInputElement).value })} />
            <div class="dialog-actions">
              <Button onClick={() => setTimeModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={!timeForm.technicianId}><CheckCircle2 size={14} /> Submit time</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

export function ProjectChangeOrders({
  projectId, phases, changeOrders, canWrite, isApprover, onSaved,
}: {
  projectId: string; phases: any[]; changeOrders: any[]; canWrite: boolean; isApprover: boolean; onSaved(): void;
}) {
  const [error, setError] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", phaseId: "", costCode: "", labor: "0", material: "0", subcontract: "0", price: "0", days: "0" });

  async function saveCo() {
    setError("");
    try {
      await api("POST", `/api/projects/${projectId}/change-orders`, {
        id: uuid(), requestKey: uuid(), expectedVersion: 0,
        title: form.title, description: form.description, phaseId: form.phaseId || null, costCode: form.costCode,
        laborCostCents: Math.round((parseFloat(form.labor) || 0) * 100),
        materialCostCents: Math.round((parseFloat(form.material) || 0) * 100),
        subcontractCostCents: Math.round((parseFloat(form.subcontract) || 0) * 100),
        priceCents: Math.round((parseFloat(form.price) || 0) * 100),
        scheduleImpactDays: parseInt(form.days, 10) || 0,
        reason: "Drafted project change order", reviewAttested: true,
      });
      setModal(false);
      setForm({ title: "", description: "", phaseId: "", costCode: "", labor: "0", material: "0", subcontract: "0", price: "0", days: "0" });
      onSaved();
    } catch (e) { setError((e as Error).message); }
  }

  async function act(co: any, action: "submit" | "approve" | "reject" | "customer_accept") {
    setError("");
    let customerAcceptedBy = "";
    if (action === "customer_accept") {
      customerAcceptedBy = window.prompt("Customer representative name who accepted this change order:") || "";
      if (!customerAcceptedBy.trim()) return;
    }
    try {
      await api("POST", `/api/projects/${projectId}/change-orders/${co.id}/action`, {
        requestKey: uuid(), expectedVersion: co.version, action, customerAcceptedBy,
        reason: `Change order #${co.number} ${action}`, reviewAttested: true,
      });
      onSaved();
    } catch (e) { setError((e as Error).message); }
  }

  const approvedTotal = changeOrders.filter((c) => c.status === "approved").reduce((s, c) => s + c.priceCents, 0);
  const pendingTotal = changeOrders.filter((c) => ["draft", "submitted"].includes(c.status)).reduce((s, c) => s + c.priceCents, 0);

  return (
    <div class="project-tab-stack">
      {error && <Notice tone="danger">{error}</Notice>}
      <section class="record-section is-open">
        <div class="record-section-heading">
          <FileDiff size={16} />
          <span class="record-section-title">Change Orders</span>
          <span class="record-section-count">{changeOrders.length}</span>
          <Badge tone="success">Approved: {money(approvedTotal)}</Badge>
          {pendingTotal !== 0 && <Badge tone="warning">Pending: {money(pendingTotal)}</Badge>}
        </div>
        <div class="record-section-body">
          <div class="record-section-toolbar">
            <Button variant="ghost" disabled={!canWrite} onClick={() => setModal(true)}><Plus size={14} /> New change order</Button>
          </div>
          {changeOrders.length ? (
            <table class="table">
              <thead><tr><th>CO #</th><th>Title</th><th>Est. Cost</th><th>Price</th><th>Schedule</th><th>Status</th><th>Customer</th><th>Actions</th></tr></thead>
              <tbody>{changeOrders.map((c) => (
                <tr key={c.id}>
                  <td>CO-{c.number}</td>
                  <th scope="row">{c.title}</th>
                  <td>{money(c.estimatedCostCents)}</td>
                  <td>{money(c.priceCents)}</td>
                  <td>{c.scheduleImpactDays ? `${c.scheduleImpactDays > 0 ? "+" : ""}${c.scheduleImpactDays}d` : "0d"}</td>
                  <td><Badge tone={c.status === "approved" ? "success" : c.status === "rejected" ? "danger" : "warning"}>{c.status}</Badge></td>
                  <td>{c.customerAccepted ? <Badge tone="success">{c.customerAcceptedBy}</Badge> : <span class="text-muted">Not accepted</span>}</td>
                  <td>
                    <div class="btn-row">
                      {canWrite && c.status === "draft" && <Button variant="ghost" onClick={() => void act(c, "submit")}>Submit</Button>}
                      {isApprover && c.status === "submitted" && <Button variant="ghost" onClick={() => void act(c, "approve")}>Approve</Button>}
                      {isApprover && ["draft", "submitted"].includes(c.status) && <Button variant="ghost" onClick={() => void act(c, "reject")}>Reject</Button>}
                      {isApprover && c.status === "approved" && !c.customerAccepted && <Button variant="ghost" onClick={() => void act(c, "customer_accept")}>Record acceptance</Button>}
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p class="text-muted">No change orders yet. Approved change orders update revised contract value without inflating pending totals.</p>}
        </div>
      </section>

      {modal && (
        <Dialog class="project-form" close={() => setModal(false)}>
          <DialogTitle>New change order</DialogTitle>
          <form class="sales-form" onSubmit={(e) => { e.preventDefault(); void saveCo(); }}>
            <TextField label="Title" value={form.title} onInput={(e) => setForm({ ...form, title: (e.target as HTMLInputElement).value })} />
            {phases.length > 0 && <Select label="Phase (optional)" value={form.phaseId} options={[{ value: "", label: "Project-level" }, ...phases.map((p) => ({ value: p.id, label: p.name }))]} onValueChange={(phaseId) => setForm({ ...form, phaseId })} />}
            <TextField label="Cost code" value={form.costCode} onInput={(e) => setForm({ ...form, costCode: (e.target as HTMLInputElement).value })} />
            <div class="sales-form-grid">
              <TextField label="Labor cost ($)" type="number" value={form.labor} onInput={(e) => setForm({ ...form, labor: (e.target as HTMLInputElement).value })} />
              <TextField label="Material cost ($)" type="number" value={form.material} onInput={(e) => setForm({ ...form, material: (e.target as HTMLInputElement).value })} />
            </div>
            <div class="sales-form-grid">
              <TextField label="Subcontract cost ($)" type="number" value={form.subcontract} onInput={(e) => setForm({ ...form, subcontract: (e.target as HTMLInputElement).value })} />
              <TextField label="Contract price ($)" type="number" value={form.price} onInput={(e) => setForm({ ...form, price: (e.target as HTMLInputElement).value })} />
            </div>
            <TextField label="Schedule impact (days)" type="number" value={form.days} onInput={(e) => setForm({ ...form, days: (e.target as HTMLInputElement).value })} />
            <label class="ui-field"><span>Scope description</span><textarea rows={3} value={form.description} onInput={(e) => setForm({ ...form, description: (e.target as HTMLTextAreaElement).value })} /></label>
            <div class="dialog-actions">
              <Button onClick={() => setModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={!form.title.trim()}><CheckCircle2 size={14} /> Create draft CO</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
