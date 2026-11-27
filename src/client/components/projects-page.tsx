import { useEffect, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { api } from "../api";
import { useAccount } from "../auth";
import { useApp } from "../context";
import { useConnectivity } from "../hooks/use-connectivity";
import { Button } from "./ui/button";
import { TextField } from "./ui/input";
import { Select } from "./ui/select";
import { Notice, Table, Badge, EmptyState } from "./ui/surfaces";
import { Dialog, DialogTitle } from "./ui/dialog";
import { ProjectGantt } from "./projects/project-gantt";
import { ProjectFinancials } from "./projects/project-financials";
import { ProjectFieldAndCrews, ProjectChangeOrders } from "./projects/project-delivery";
import { ProjectPurchasingAndSubs, ProjectProgressBilling } from "./projects/project-commercial";
import { ProjectWipAndAudit } from "./projects/project-wip";
import { Plus, CheckCircle2, FolderKanban, ChevronDown, Edit3 } from "lucide-preact";

const money = (cents?: number | null) => cents == null ? "—" : "$" + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUSES = ["draft", "active", "on_hold", "completed", "closed"] as const;
const STATUS_LABEL: Record<string, string> = { draft: "Draft", active: "Active", on_hold: "On hold", completed: "Completed", closed: "Closed" };
const TRACKS = ["commercial", "construction", "service"] as const;
const TRACK_LABEL: Record<string, string> = { commercial: "Commercial", construction: "Construction", service: "Service" };
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "field", label: "Field & Crews" },
  { id: "changes", label: "Change Orders" },
  { id: "purchasing", label: "Purchasing & Subs" },
  { id: "billing", label: "Progress Billing" },
  { id: "wip", label: "WIP & Audit" },
] as const;
type TabId = typeof TABS[number]["id"];
const uuid = () => crypto.randomUUID();
const reason = "Reviewed project structure";

type Project = { id: string; customer_id: string; title: string; description: string; status: string; track?: string; contract_value_cents?: number; retainage_bps?: number; project_manager: string; planned_start: string; planned_end: string; actual_start: string; actual_end: string; baseline_cost_cents: number | null; baseline_start: string; baseline_end: string; estimate_to_complete_cents: number | null; baselined_at: string | null; source_kind: string | null; source_id: string | null; version: number; archived: number };
type Detail = { project: Project; phases: any[]; milestones: any[]; jobs: any[]; sites: any[]; deliverables: any[]; financials: { actualCostCents: number; committedCostCents: number | null; currency: string }; overdueActions: any[]; source: { kind: string; id?: string; quoteId?: string; opportunityId?: string; title?: string; value?: number; probability?: number; closeDate?: string; pipeline?: string; stage?: string; stageKind?: string } | null; costSections: any[]; profitLoss: { totalCostCents: number; totalBillableCents: number; profitCents: number; marginPercent: number | null }; fieldDocs?: any[]; billingReadiness?: { requiredCount: number; approvedCount: number; ready: boolean }; crews?: any[]; crewTime?: any[]; changeOrders?: any[]; purchasing?: { links: any[]; nativeOrders: any[]; summary: { committedCents: number; receivedCents: number; billedCents: number; openCommitmentCents: number } }; subcontractors?: any[]; sovLines?: any[]; billingApps?: any[]; wip?: any; wipSnapshots?: any[] };

function RecordSection({ title, count, defaultOpen = true, children }: { title: string; count?: number; defaultOpen?: boolean; children: ComponentChildren }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section class={"record-section" + (open ? " is-open" : "")}>
      <button type="button" class="record-section-heading" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ChevronDown size={16} class={"record-section-chevron" + (open ? "" : " is-closed")} />
        <span class="record-section-title">{title}</span>
        {count != null && <span class="record-section-count">{count}</span>}
      </button>
      {open && <div class="record-section-body">{children}</div>}
    </section>
  );
}

export function ProjectsPage({ id }: { id: string | null }) {
  const { navigate, customers, technicians } = useApp();
  const { user } = useAccount();
  const { readOnly } = useConnectivity();
  const canWrite = user.role !== "viewer" && user.active && !user.mustChangePassword && !readOnly;
  const isApprover = ["owner", "admin"].includes(user.role) && user.active && !user.mustChangePassword && !readOnly;
  const [list, setList] = useState<{ rows: Project[]; total: number; page: number } | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ customerId: "", title: "", status: "active", track: "commercial", contractValue: "0", retainagePct: "10", projectManager: "", plannedStart: "", plannedEnd: "" });
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", status: "active", track: "commercial", contractValue: "0", retainagePct: "10", projectManager: "", plannedStart: "", plannedEnd: "", actualStart: "", actualEnd: "", description: "" });
  const [phaseForm, setPhaseForm] = useState<null | { id?: string; expectedVersion: number; position: number; name: string; costCode: string; owner: string; plannedStart: string; plannedEnd: string; percentComplete: number }>(null);
  const [sovFromPhase, setSovFromPhase] = useState<null | { phaseId: string; itemNumber: string; description: string; costCode: string; scheduledValue: string }>(null);
  const [milestoneForm, setMilestoneForm] = useState<null | { name: string; dueDate: string }>(null);
  const [deliverableForm, setDeliverableForm] = useState<null | { name: string; dueDate: string }>(null);

  const startEdit = () => {
    const p = detail?.project;
    if (!p) return;
    setEditForm({
      title: p.title, status: p.status, track: p.track || "commercial",
      contractValue: String(((p.contract_value_cents ?? 0) / 100).toFixed(2)),
      retainagePct: String(((p.retainage_bps ?? 1000) / 100).toFixed(2)),
      projectManager: p.project_manager, plannedStart: p.planned_start, plannedEnd: p.planned_end,
      actualStart: p.actual_start, actualEnd: p.actual_end, description: p.description,
    });
    setEditing(true);
  };
  async function saveProject() {
    if (!detail) return;
    setError("");
    try {
      await api("POST", "/api/projects", {
        id: detail.project.id, requestKey: uuid(), expectedVersion: detail.project.version,
        customerId: detail.project.customer_id, title: editForm.title, description: editForm.description,
        status: editForm.status, track: editForm.track,
        contractValueCents: Math.round((parseFloat(editForm.contractValue) || 0) * 100),
        retainageBps: Math.round((parseFloat(editForm.retainagePct) || 0) * 100),
        projectManager: editForm.projectManager, plannedStart: editForm.plannedStart, plannedEnd: editForm.plannedEnd,
        actualStart: editForm.actualStart, actualEnd: editForm.actualEnd,
        sourceKind: detail.project.source_kind, sourceId: detail.project.source_id, archived: false, reason, reviewAttested: true,
      });
      setEditing(false);
      setRevision((r) => r + 1);
    } catch (e) { setError((e as Error).message); }
  }
  async function savePhase() {
    if (!id || !phaseForm) return;
    setError("");
    try {
      await api("POST", `/api/projects/${id}/phases`, {
        id: phaseForm.id || uuid(), requestKey: uuid(), expectedVersion: phaseForm.expectedVersion,
        name: phaseForm.name, costCode: phaseForm.costCode, owner: phaseForm.owner,
        plannedStart: phaseForm.plannedStart, plannedEnd: phaseForm.plannedEnd,
        actualStart: "", actualEnd: "", position: phaseForm.position,
        percentComplete: Number(phaseForm.percentComplete) || 0, reason, reviewAttested: true,
      });
      setPhaseForm(null);
      setRevision((r) => r + 1);
    } catch (e) { setError((e as Error).message); }
  }
  async function updatePhaseDates(phase: any, plannedStart: string, plannedEnd: string) {
    if (!id) return;
    setError("");
    try {
      await api("POST", `/api/projects/${id}/phases`, {
        id: phase.id, requestKey: uuid(), expectedVersion: phase.version ?? 1,
        name: phase.name, costCode: phase.costCode || "", owner: phase.owner || "",
        plannedStart, plannedEnd, actualStart: phase.actualStart || "", actualEnd: phase.actualEnd || "",
        position: phase.position ?? 1, percentComplete: phase.percentComplete ?? 0,
        reason: "Adjusted project phase dates on Gantt timeline", reviewAttested: true,
      });
      setRevision((r) => r + 1);
    } catch (e) { setError((e as Error).message); }
  }
  async function saveSovFromPhase() {
    if (!id || !sovFromPhase) return;
    setError("");
    try {
      await api("POST", `/api/projects/${id}/sov`, {
        id: uuid(), requestKey: uuid(), expectedVersion: 0,
        phaseId: sovFromPhase.phaseId, costCode: sovFromPhase.costCode,
        itemNumber: sovFromPhase.itemNumber.trim(), description: sovFromPhase.description.trim(),
        scheduledValueCents: Math.round((parseFloat(sovFromPhase.scheduledValue) || 0) * 100),
        changeOrderId: null, position: (detail?.sovLines?.length ?? 0) + 1,
        reason: "Added Gantt phase to Schedule of Values for progress billing", reviewAttested: true,
      });
      setSovFromPhase(null);
      setRevision((r) => r + 1);
    } catch (e) { setError((e as Error).message); }
  }
  async function saveMilestoneEntry() {
    if (!id || !milestoneForm) return;
    setError("");
    try {
      await api("POST", `/api/projects/${id}/milestones`, { id: uuid(), requestKey: uuid(), name: milestoneForm.name, dueDate: milestoneForm.dueDate, completed: false, reason, reviewAttested: true });
      setMilestoneForm(null);
      setRevision((r) => r + 1);
    } catch (e) { setError((e as Error).message); }
  }
  async function saveDeliverableEntry() {
    if (!id || !deliverableForm) return;
    setError("");
    try {
      await api("POST", `/api/projects/${id}/deliverables`, { id: uuid(), requestKey: uuid(), name: deliverableForm.name, dueDate: deliverableForm.dueDate, completed: false, reason, reviewAttested: true });
      setDeliverableForm(null);
      setRevision((r) => r + 1);
    } catch (e) { setError((e as Error).message); }
  }

  useEffect(() => {
    let live = true;
    setError(""); setDetail(null); setList(null);
    const path = id ? `/api/projects/${id}` : `/api/projects?page=${page}`;
    void api<any>("GET", path).then((v) => { if (live) id ? setDetail(v) : setList(v); })
      .catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [id, page, revision]);

  async function create() {
    if (!form.customerId || !form.title.trim()) { setError("Choose a customer and title."); return; }
    const projectId = uuid();
    await api("POST", "/api/projects", {
      id: projectId, requestKey: uuid(), expectedVersion: 0, customerId: form.customerId, title: form.title.trim(),
      description: "", status: form.status, track: form.track,
      contractValueCents: Math.round((parseFloat(form.contractValue) || 0) * 100),
      retainageBps: Math.round((parseFloat(form.retainagePct) || 0) * 100),
      projectManager: form.projectManager, plannedStart: form.plannedStart, plannedEnd: form.plannedEnd,
      sourceKind: null, sourceId: null, archived: false, reason, reviewAttested: true,
    }).catch((e) => { setError((e as Error).message); throw e; });
    setCreating(false);
    navigate(`/projects/${projectId}`);
  }

  const customerName = (customerId: string) => customers.find((c) => c.id === customerId)?.name || customerId;

  return (
    <div class="page projects-page">
      {!id && (
        <>
          <header class="page-header">
            <div><h1>Projects</h1><p class="workspace-help">Commercial and construction projects: phases, milestones, deliverables and linked jobs.</p></div>
            <div class="page-header-right">
              <Button disabled={!canWrite} onClick={() => setCreating(true)}><Plus size={16} /> New project</Button>
            </div>
          </header>
          {error && <Notice tone="danger">{error}</Notice>}
          {list ? (
            <>
              <Table label="Projects">
                <thead><tr><th>Project</th><th>Customer</th><th>Status</th><th>Manager</th><th>Planned</th></tr></thead>
                <tbody>{list.rows.map((p) => (
                  <tr key={p.id} class="table-row clickable" onClick={() => navigate(`/projects/${p.id}`)}>
                    <th scope="row"><Button variant="ghost" onClick={() => navigate(`/projects/${p.id}`)}>{p.title}</Button></th>
                    <td class="text-muted">{customerName(p.customer_id)}</td>
                    <td><Badge tone={p.status === "active" ? "success" : p.status === "completed" ? "info" : "neutral"}>{STATUS_LABEL[p.status] || p.status}</Badge></td>
                    <td class="text-muted">{p.project_manager || "—"}</td>
                    <td class="text-muted">{p.planned_start || "—"} → {p.planned_end || "—"}</td>
                  </tr>
                ))}</tbody>
              </Table>
              {!list.rows.length && <EmptyState title="No projects yet">Create a project to track phases, milestones and linked jobs.</EmptyState>}
              <div class="pagination"><Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><span>{list.total} projects · page {page}</span><Button disabled={page * 50 >= list.total} onClick={() => setPage((p) => p + 1)}>Next</Button></div>
            </>
          ) : <p role="status">Loading projects…</p>}
        </>
      )}

      {id && detail && (
        <>
          <div class="record-header account-record-header">
            <div class="record-header-main">
              <button class="btn btn-back" onClick={() => navigate("/projects")}>Back</button>
              <span class="account-icon" aria-hidden="true"><FolderKanban size={20} /></span>
              <div>
                <span class="account-eyebrow">Project</span>
                <h1 class="record-header-title">{detail.project.title}</h1>
                <div class="record-header-subtitle">
                  <Badge tone={detail.project.status === "active" ? "success" : "neutral"}>{STATUS_LABEL[detail.project.status] || detail.project.status}</Badge>
                  <Badge tone="info">{TRACK_LABEL[detail.project.track || "commercial"] || detail.project.track}</Badge>
                  <span>{customerName(detail.project.customer_id)}</span>
                  <span>{detail.project.project_manager || "No project manager"}</span>
                  {detail.project.source_kind === "quote" && <span>From accepted proposal</span>}
                </div>
              </div>
            </div>
            <div class="page-header-right">
              <Button onClick={startEdit} disabled={!canWrite}><Edit3 size={14} /> Edit project</Button>
            </div>
          </div>

          <nav class="project-tabs" role="tablist" aria-label="Project workspace sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                class={"project-tab" + (tab === t.id ? " is-active" : "")}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {tab === "overview" && (
            <>
              <RecordSection title="Gantt & Phases" count={detail.phases.length}>
                <ProjectGantt
                  phases={detail.phases}
                  milestones={detail.milestones}
                  sovLines={detail.sovLines || []}
                  canWrite={canWrite}
                  onAddPhase={() => setPhaseForm({ expectedVersion: 0, position: detail.phases.length + 1, name: "", costCode: "", owner: "", plannedStart: "", plannedEnd: "", percentComplete: 0 })}
                  onEditPhase={(p) => setPhaseForm({ id: p.id, expectedVersion: p.version ?? 1, position: p.position ?? 1, name: p.name, costCode: p.costCode || "", owner: p.owner || "", plannedStart: p.plannedStart || "", plannedEnd: p.plannedEnd || "", percentComplete: p.percentComplete ?? 0 })}
                  onUpdatePhaseDates={updatePhaseDates}
                  onBillPhase={(p, existingSov) => {
                    if (existingSov) { setTab("billing"); return; }
                    setSovFromPhase({
                      phaseId: p.id,
                      itemNumber: String((detail.sovLines?.length ?? 0) + 1).padStart(3, "0"),
                      description: p.name,
                      costCode: p.costCode || "",
                      scheduledValue: "0",
                    });
                  }}
                />
              </RecordSection>

              <div class="account-layout projects-layout">
                <div class="account-col">
                  <RecordSection title="About">
                    <div class="account-fields">
                      {[
                        ["Status", STATUS_LABEL[detail.project.status] || detail.project.status],
                        ["Track", TRACK_LABEL[detail.project.track || "commercial"] || detail.project.track],
                        ["Contract value", money(detail.project.contract_value_cents ?? 0)],
                        ["Default retainage", `${((detail.project.retainage_bps ?? 1000) / 100).toFixed(1)}%`],
                        ["Customer", customerName(detail.project.customer_id)],
                        ["Site", detail.sites[0]?.name],
                        ["Project manager", detail.project.project_manager],
                        ["Planned", `${detail.project.planned_start || "—"} → ${detail.project.planned_end || "—"}`],
                        ["Actual", `${detail.project.actual_start || "—"} → ${detail.project.actual_end || "—"}`],
                        ["Description", detail.project.description],
                      ].map(([label, value]) => (
                        <div class="account-field" key={label}>
                          <span class="account-field-label">{label}</span>
                          <span class="account-field-value">{value || "—"}</span>
                        </div>
                      ))}
                      {detail.source?.kind === "opportunity" && (
                        <div class="account-field">
                          <span class="account-field-label">Opportunity</span>
                          <span class="account-field-value"><button type="button" class="account-link" onClick={() => navigate(`/sales/${detail.source!.opportunityId}`)}>{detail.source!.title} · {detail.source!.stage}</button></span>
                        </div>
                      )}
                    </div>
                  </RecordSection>
                  <RecordSection title="Financials">
                    <div class="account-fields">
                      {[
                        ["Baseline budget", money(detail.project.baseline_cost_cents)],
                        ["Actual cost", money(detail.financials?.actualCostCents)],
                        ["Estimate to complete", money(detail.project.estimate_to_complete_cents)],
                        ["Committed", money(detail.financials?.committedCostCents)],
                      ].map(([label, value]) => (
                        <div class="account-field" key={label}>
                          <span class="account-field-label">{label}</span>
                          <span class="account-field-value">{value}</span>
                        </div>
                      ))}
                    </div>
                    {detail.overdueActions?.length > 0 && <p class="project-overdue">{detail.overdueActions.length} overdue action{detail.overdueActions.length === 1 ? "" : "s"}</p>}
                    <div class="project-financials-divider" />
                    <ProjectFinancials projectId={detail.project.id} sections={detail.costSections} profitLoss={detail.profitLoss} canWrite={canWrite} onSaved={() => setRevision((r) => r + 1)} />
                  </RecordSection>
                </div>

                <div class="account-col">
                  <RecordSection title="Milestones" count={detail.milestones.length}>
                    <div class="record-section-toolbar"><Button variant="ghost" disabled={!canWrite} onClick={() => setMilestoneForm({ name: "", dueDate: "" })}><Plus size={14} /> Add milestone</Button></div>
                    {detail.milestones.length ? (
                      <table class="table"><thead><tr><th>Milestone</th><th>Due</th><th>Status</th></tr></thead>
                        <tbody>{detail.milestones.map((m) => <tr key={m.id}><th scope="row">{m.name}</th><td class="text-muted">{m.dueDate || "—"}</td><td><Badge tone={m.completed ? "success" : "neutral"}>{m.completed ? "Complete" : "Open"}</Badge></td></tr>)}</tbody>
                      </table>
                    ) : <p class="text-muted">No milestones yet.</p>}
                  </RecordSection>
                </div>

                <div class="account-col">
                  <RecordSection title="Deliverables" count={detail.deliverables.length}>
                    <div class="record-section-toolbar"><Button variant="ghost" disabled={!canWrite} onClick={() => setDeliverableForm({ name: "", dueDate: "" })}><Plus size={14} /> Add deliverable</Button></div>
                    {detail.deliverables.length ? (
                      <table class="table"><thead><tr><th>Deliverable</th><th>Due</th><th>Status</th></tr></thead>
                        <tbody>{detail.deliverables.map((d) => <tr key={d.id}><th scope="row">{d.name}</th><td class="text-muted">{d.dueDate || "—"}</td><td><Badge tone={d.completed ? "success" : "neutral"}>{d.completed ? "Complete" : "Open"}</Badge></td></tr>)}</tbody>
                      </table>
                    ) : <p class="text-muted">No deliverables yet.</p>}
                  </RecordSection>
                </div>
              </div>
            </>
          )}

          {tab === "field" && (
            <ProjectFieldAndCrews
              projectId={detail.project.id}
              phases={detail.phases}
              jobs={detail.jobs}
              technicians={technicians}
              fieldDocs={detail.fieldDocs || []}
              billingReadiness={detail.billingReadiness || { requiredCount: 0, approvedCount: 0, ready: true }}
              crews={detail.crews || []}
              crewTime={detail.crewTime || []}
              canWrite={canWrite}
              isApprover={isApprover}
              onSaved={() => setRevision((r) => r + 1)}
            />
          )}

          {tab === "changes" && (
            <ProjectChangeOrders
              projectId={detail.project.id}
              phases={detail.phases}
              changeOrders={detail.changeOrders || []}
              canWrite={canWrite}
              isApprover={isApprover}
              onSaved={() => setRevision((r) => r + 1)}
            />
          )}

          {tab === "purchasing" && (
            <ProjectPurchasingAndSubs
              projectId={detail.project.id}
              phases={detail.phases}
              purchasing={detail.purchasing || { links: [], nativeOrders: [], summary: { committedCents: 0, receivedCents: 0, billedCents: 0, openCommitmentCents: 0 } }}
              subcontractors={detail.subcontractors || []}
              canWrite={canWrite}
              isApprover={isApprover}
              onSaved={() => setRevision((r) => r + 1)}
            />
          )}

          {tab === "billing" && (
            <ProjectProgressBilling
              projectId={detail.project.id}
              phases={detail.phases}
              changeOrders={detail.changeOrders || []}
              sovLines={detail.sovLines || []}
              billingApps={detail.billingApps || []}
              retainageBps={detail.project.retainage_bps ?? 1000}
              canWrite={canWrite}
              isApprover={isApprover}
              onSaved={() => setRevision((r) => r + 1)}
            />
          )}

          {tab === "wip" && detail.wip && (
            <ProjectWipAndAudit
              projectId={detail.project.id}
              initialWip={detail.wip}
              snapshots={detail.wipSnapshots || []}
              isApprover={isApprover}
              onSaved={() => setRevision((r) => r + 1)}
            />
          )}
        </>
      )}
      {id && !detail && !error && <p role="status">Loading project…</p>}

      {creating && (
        <Dialog class="project-form" close={() => setCreating(false)}>
          <DialogTitle>New project</DialogTitle>
          <form class="sales-form" onSubmit={(e) => { e.preventDefault(); void create(); }}>
            <Select label="Customer" value={form.customerId} options={customers.map((c) => ({ value: c.id, label: c.name }))} onValueChange={(customerId) => setForm({ ...form, customerId })} />
            <TextField label="Title" value={form.title} onInput={(e) => setForm({ ...form, title: (e.target as HTMLInputElement).value })} />
            <Select label="Status" value={form.status} options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} onValueChange={(status) => setForm({ ...form, status })} />
            <Select label="Track" value={form.track} options={TRACKS.map((t) => ({ value: t, label: TRACK_LABEL[t] }))} onValueChange={(track) => setForm({ ...form, track })} />
            <div class="sales-form-grid">
              <TextField label="Contract value ($)" type="number" value={form.contractValue} onInput={(e) => setForm({ ...form, contractValue: (e.target as HTMLInputElement).value })} />
              <TextField label="Retainage (%)" type="number" value={form.retainagePct} onInput={(e) => setForm({ ...form, retainagePct: (e.target as HTMLInputElement).value })} />
            </div>
            <TextField label="Project manager" value={form.projectManager} onInput={(e) => setForm({ ...form, projectManager: (e.target as HTMLInputElement).value })} />
            <div class="sales-form-grid">
              <TextField label="Planned start (YYYY-MM-DD)" value={form.plannedStart} onInput={(e) => setForm({ ...form, plannedStart: (e.target as HTMLInputElement).value })} />
              <TextField label="Planned end (YYYY-MM-DD)" value={form.plannedEnd} onInput={(e) => setForm({ ...form, plannedEnd: (e.target as HTMLInputElement).value })} />
            </div>
            {error && <p class="workspace-error" role="alert">{error}</p>}
            <div class="dialog-actions">
              <Button onClick={() => setCreating(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={!canWrite}><CheckCircle2 size={14} /> Create project</Button>
            </div>
          </form>
        </Dialog>
      )}

      {editing && detail && (
        <Dialog class="project-form" close={() => setEditing(false)}>
          <DialogTitle>Edit project</DialogTitle>
          <form class="sales-form" onSubmit={(e) => { e.preventDefault(); void saveProject(); }}>
            <TextField label="Title" value={editForm.title} onInput={(e) => setEditForm({ ...editForm, title: (e.target as HTMLInputElement).value })} />
            <Select label="Status" value={editForm.status} options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} onValueChange={(status) => setEditForm({ ...editForm, status })} />
            <Select label="Track" value={editForm.track} options={TRACKS.map((t) => ({ value: t, label: TRACK_LABEL[t] }))} onValueChange={(track) => setEditForm({ ...editForm, track })} />
            <div class="sales-form-grid">
              <TextField label="Contract value ($)" type="number" value={editForm.contractValue} onInput={(e) => setEditForm({ ...editForm, contractValue: (e.target as HTMLInputElement).value })} />
              <TextField label="Retainage (%)" type="number" value={editForm.retainagePct} onInput={(e) => setEditForm({ ...editForm, retainagePct: (e.target as HTMLInputElement).value })} />
            </div>
            <TextField label="Project manager" value={editForm.projectManager} onInput={(e) => setEditForm({ ...editForm, projectManager: (e.target as HTMLInputElement).value })} />
            <div class="sales-form-grid">
              <TextField label="Planned start" type="date" value={editForm.plannedStart} onInput={(e) => setEditForm({ ...editForm, plannedStart: (e.target as HTMLInputElement).value })} />
              <TextField label="Planned end" type="date" value={editForm.plannedEnd} onInput={(e) => setEditForm({ ...editForm, plannedEnd: (e.target as HTMLInputElement).value })} />
            </div>
            <div class="sales-form-grid">
              <TextField label="Actual start" type="date" value={editForm.actualStart} onInput={(e) => setEditForm({ ...editForm, actualStart: (e.target as HTMLInputElement).value })} />
              <TextField label="Actual end" type="date" value={editForm.actualEnd} onInput={(e) => setEditForm({ ...editForm, actualEnd: (e.target as HTMLInputElement).value })} />
            </div>
            <label class="ui-field"><span>Description</span><textarea rows={3} value={editForm.description} onInput={(e) => setEditForm({ ...editForm, description: (e.target as HTMLTextAreaElement).value })} /></label>
            {error && <p class="workspace-error" role="alert">{error}</p>}
            <div class="dialog-actions">
              <Button onClick={() => setEditing(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={!canWrite}><CheckCircle2 size={14} /> Save project</Button>
            </div>
          </form>
        </Dialog>
      )}

      {phaseForm && (
        <Dialog class="project-form" close={() => setPhaseForm(null)}>
          <DialogTitle>{phaseForm.id ? "Edit phase" : "Add phase"}</DialogTitle>
          <form class="sales-form" onSubmit={(e) => { e.preventDefault(); void savePhase(); }}>
            <TextField label="Phase name" value={phaseForm.name} onInput={(e) => setPhaseForm({ ...phaseForm, name: (e.target as HTMLInputElement).value })} />
            <div class="sales-form-grid">
              <TextField label="Cost code" value={phaseForm.costCode} onInput={(e) => setPhaseForm({ ...phaseForm, costCode: (e.target as HTMLInputElement).value })} />
              <TextField label="Owner" value={phaseForm.owner} onInput={(e) => setPhaseForm({ ...phaseForm, owner: (e.target as HTMLInputElement).value })} />
            </div>
            <div class="sales-form-grid">
              <TextField label="Planned start" type="date" value={phaseForm.plannedStart} onInput={(e) => setPhaseForm({ ...phaseForm, plannedStart: (e.target as HTMLInputElement).value })} />
              <TextField label="Planned end" type="date" value={phaseForm.plannedEnd} onInput={(e) => setPhaseForm({ ...phaseForm, plannedEnd: (e.target as HTMLInputElement).value })} />
            </div>
            <TextField label="% complete" type="number" value={String(phaseForm.percentComplete)} onInput={(e) => setPhaseForm({ ...phaseForm, percentComplete: Number((e.target as HTMLInputElement).value) || 0 })} />
            {error && <p class="workspace-error" role="alert">{error}</p>}
            <div class="dialog-actions">
              <Button onClick={() => setPhaseForm(null)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={!canWrite}><CheckCircle2 size={14} /> {phaseForm.id ? "Save phase" : "Add phase"}</Button>
            </div>
          </form>
        </Dialog>
      )}

      {sovFromPhase && (
        <Dialog class="project-form" close={() => setSovFromPhase(null)}>
          <DialogTitle>Add Gantt stage to Schedule of Values</DialogTitle>
          <form class="sales-form" onSubmit={(e) => { e.preventDefault(); void saveSovFromPhase(); }}>
            <div class="sales-form-grid">
              <TextField label="SOV Item #" value={sovFromPhase.itemNumber} onInput={(e) => setSovFromPhase({ ...sovFromPhase, itemNumber: (e.target as HTMLInputElement).value })} />
              <TextField label="Cost code" value={sovFromPhase.costCode} onInput={(e) => setSovFromPhase({ ...sovFromPhase, costCode: (e.target as HTMLInputElement).value })} />
            </div>
            <TextField label="Description" value={sovFromPhase.description} onInput={(e) => setSovFromPhase({ ...sovFromPhase, description: (e.target as HTMLInputElement).value })} />
            <TextField label="Scheduled value ($)" type="number" value={sovFromPhase.scheduledValue} onInput={(e) => setSovFromPhase({ ...sovFromPhase, scheduledValue: (e.target as HTMLInputElement).value })} />
            {error && <p class="workspace-error" role="alert">{error}</p>}
            <div class="dialog-actions">
              <Button onClick={() => setSovFromPhase(null)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={!canWrite || !sovFromPhase.itemNumber.trim()}><CheckCircle2 size={14} /> Add to SOV</Button>
            </div>
          </form>
        </Dialog>
      )}

      {milestoneForm && (
        <Dialog class="project-form" close={() => setMilestoneForm(null)}>
          <DialogTitle>Add milestone</DialogTitle>
          <form class="sales-form" onSubmit={(e) => { e.preventDefault(); void saveMilestoneEntry(); }}>
            <TextField label="Milestone" value={milestoneForm.name} onInput={(e) => setMilestoneForm({ ...milestoneForm, name: (e.target as HTMLInputElement).value })} />
            <TextField label="Due date" type="date" value={milestoneForm.dueDate} onInput={(e) => setMilestoneForm({ ...milestoneForm, dueDate: (e.target as HTMLInputElement).value })} />
            {error && <p class="workspace-error" role="alert">{error}</p>}
            <div class="dialog-actions">
              <Button onClick={() => setMilestoneForm(null)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={!canWrite}><Plus size={14} /> Add milestone</Button>
            </div>
          </form>
        </Dialog>
      )}

      {deliverableForm && (
        <Dialog class="project-form" close={() => setDeliverableForm(null)}>
          <DialogTitle>Add deliverable</DialogTitle>
          <form class="sales-form" onSubmit={(e) => { e.preventDefault(); void saveDeliverableEntry(); }}>
            <TextField label="Deliverable" value={deliverableForm.name} onInput={(e) => setDeliverableForm({ ...deliverableForm, name: (e.target as HTMLInputElement).value })} />
            <TextField label="Due date" type="date" value={deliverableForm.dueDate} onInput={(e) => setDeliverableForm({ ...deliverableForm, dueDate: (e.target as HTMLInputElement).value })} />
            {error && <p class="workspace-error" role="alert">{error}</p>}
            <div class="dialog-actions">
              <Button onClick={() => setDeliverableForm(null)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={!canWrite}><Plus size={14} /> Add deliverable</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
