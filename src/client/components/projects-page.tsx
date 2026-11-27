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
import { Plus, CheckCircle2, FolderKanban, ChevronDown } from "lucide-preact";

const money = (cents?: number | null) => cents == null ? "—" : "$" + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUSES = ["draft", "active", "on_hold", "completed", "closed"] as const;
const STATUS_LABEL: Record<string, string> = { draft: "Draft", active: "Active", on_hold: "On hold", completed: "Completed", closed: "Closed" };
const uuid = () => crypto.randomUUID();
const reason = "Reviewed project structure";

type Project = { id: string; customer_id: string; title: string; description: string; status: string; project_manager: string; planned_start: string; planned_end: string; actual_start: string; actual_end: string; baseline_cost_cents: number | null; baseline_start: string; baseline_end: string; estimate_to_complete_cents: number | null; baselined_at: string | null; source_kind: string | null; source_id: string | null; version: number; archived: number };
type Detail = { project: Project; phases: any[]; milestones: any[]; jobs: any[]; sites: any[]; deliverables: any[]; financials: { actualCostCents: number; committedCostCents: number | null; currency: string }; overdueActions: any[] };

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
  const { navigate, customers } = useApp();
  const { user } = useAccount();
  const { readOnly } = useConnectivity();
  const canWrite = user.role !== "viewer" && user.active && !user.mustChangePassword && !readOnly;
  const [list, setList] = useState<{ rows: Project[]; total: number; page: number } | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ customerId: "", title: "", status: "active", projectManager: "", plannedStart: "", plannedEnd: "" });

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
      description: "", status: form.status, projectManager: form.projectManager, plannedStart: form.plannedStart, plannedEnd: form.plannedEnd,
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
                  <span>{customerName(detail.project.customer_id)}</span>
                  <span>{detail.project.project_manager || "No project manager"}</span>
                  {detail.project.source_kind === "quote" && <span>From accepted proposal</span>}
                </div>
              </div>
            </div>
          </div>

          <RecordSection title="Gantt">
            <ProjectGantt phases={detail.phases} milestones={detail.milestones} />
          </RecordSection>

          <div class="account-layout projects-layout">
            <div class="account-col">
              <RecordSection title="About">
                <div class="account-fields">
                  {[
                    ["Status", STATUS_LABEL[detail.project.status] || detail.project.status],
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
              </RecordSection>
            </div>

            <div class="account-col">
              <RecordSection title="Phases" count={detail.phases.length}>
                {detail.phases.length ? (
                  <table class="table"><thead><tr><th>Phase</th><th>Cost code</th><th>Owner</th></tr></thead>
                    <tbody>{detail.phases.map((p) => <tr key={p.id}><th scope="row">{p.name}</th><td>{p.costCode || "—"}</td><td class="text-muted">{p.owner || "—"}</td></tr>)}</tbody>
                  </table>
                ) : <p class="text-muted">No phases yet.</p>}
              </RecordSection>
              <RecordSection title="Milestones" count={detail.milestones.length}>
                {detail.milestones.length ? (
                  <table class="table"><thead><tr><th>Milestone</th><th>Due</th><th>Status</th></tr></thead>
                    <tbody>{detail.milestones.map((m) => <tr key={m.id}><th scope="row">{m.name}</th><td class="text-muted">{m.dueDate || "—"}</td><td><Badge tone={m.completed ? "success" : "neutral"}>{m.completed ? "Complete" : "Open"}</Badge></td></tr>)}</tbody>
                  </table>
                ) : <p class="text-muted">No milestones yet.</p>}
              </RecordSection>
            </div>

            <div class="account-col">
              <RecordSection title="Deliverables" count={detail.deliverables.length}>
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
      {id && !detail && !error && <p role="status">Loading project…</p>}

      {creating && (
        <Dialog class="project-form" close={() => setCreating(false)}>
          <DialogTitle>New project</DialogTitle>
          <form class="sales-form" onSubmit={(e) => { e.preventDefault(); void create(); }}>
            <Select label="Customer" value={form.customerId} options={customers.map((c) => ({ value: c.id, label: c.name }))} onValueChange={(customerId) => setForm({ ...form, customerId })} />
            <TextField label="Title" value={form.title} onInput={(e) => setForm({ ...form, title: (e.target as HTMLInputElement).value })} />
            <Select label="Status" value={form.status} options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} onValueChange={(status) => setForm({ ...form, status })} />
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
    </div>
  );
}
