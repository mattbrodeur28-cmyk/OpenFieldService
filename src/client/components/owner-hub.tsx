import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { useApp } from "../context";
import { useAccount, isAdministrator } from "../auth";
import { Button } from "./ui/button";
import { TextField } from "./ui/input";
import { Select } from "./ui/select";
import { Badge, Notice, Table } from "./ui/surfaces";
import { Play, Download, KeyRound, Plus } from "lucide-preact";

const money = (cents?: number | null) => cents == null ? "—" : "$" + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function OwnerHub() {
  const { user } = useAccount();
  const { navigate, customers } = useApp();
  const admin = isAdministrator(user);
  const [tab, setTab] = useState<"dashboard" | "reports" | "automations" | "portal">("dashboard");
  const [dash, setDash] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [automations, setAutomations] = useState<any[]>([]);
  const [tokens, setTokens] = useState<any[]>([]);
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [rev, setRev] = useState(0);

  const [repForm, setRepForm] = useState({ name: "", dataset: "invoices", schedule: "weekly" });
  const [autoForm, setAutoForm] = useState({ name: "", triggerKind: "invoice_overdue", actionKind: "flag_review" });
  const [tokForm, setTokForm] = useState({ customerId: "", label: "Customer portal access", expiresInDays: "30" });

  useEffect(() => {
    if (!admin) return;
    let live = true;
    setError("");
    void Promise.all([
      api<any>("GET", "/api/business/dashboard"),
      api<{ reports: any[] }>("GET", "/api/business/reports"),
      api<{ automations: any[] }>("GET", "/api/business/automations"),
      api<{ tokens: any[] }>("GET", "/api/business/portal-tokens"),
    ]).then(([d, r, a, t]) => {
      if (!live) return;
      setDash(d);
      setReports(r.reports || []);
      setAutomations(a.automations || []);
      setTokens(t.tokens || []);
    }).catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [admin, rev]);

  if (!admin) return <div class="page"><Notice tone="warning">Owner or Admin access is required for the Business Owner Hub.</Notice></div>;

  async function saveReport(e: Event) {
    e.preventDefault();
    if (!repForm.name.trim()) return;
    setError("");
    try {
      await api("POST", "/api/business/reports", { name: repForm.name.trim(), dataset: repForm.dataset, schedule: repForm.schedule, filters: {} });
      setRepForm({ name: "", dataset: "invoices", schedule: "weekly" });
      setRev((r) => r + 1);
    } catch (err) { setError((err as Error).message); }
  }

  async function saveAutomation(e: Event) {
    e.preventDefault();
    if (!autoForm.name.trim()) return;
    setError("");
    try {
      await api("POST", "/api/business/automations", { name: autoForm.name.trim(), triggerKind: autoForm.triggerKind, actionKind: autoForm.actionKind, requiresApproval: true, enabled: false, config: {} });
      setAutoForm({ name: "", triggerKind: "invoice_overdue", actionKind: "flag_review" });
      setRev((r) => r + 1);
    } catch (err) { setError((err as Error).message); }
  }

  async function toggleAutomation(rule: any) {
    setError("");
    try {
      await api("POST", "/api/business/automations", { id: rule.id, name: rule.name, triggerKind: rule.triggerKind, actionKind: rule.actionKind, requiresApproval: rule.requiresApproval, enabled: !rule.enabled, config: rule.config || {} });
      setRev((r) => r + 1);
    } catch (err) { setError((err as Error).message); }
  }

  async function dryRun(id: string) {
    setError("");
    try {
      const res = await api<any>("POST", `/api/business/automations/${id}/dry-run`, {});
      setDryRunResult(res);
      setRev((r) => r + 1);
    } catch (err) { setError((err as Error).message); }
  }

  async function issueToken(e: Event) {
    e.preventDefault();
    if (!tokForm.customerId || !tokForm.label.trim()) return;
    setError("");
    try {
      const res = await api<{ token: string }>("POST", "/api/business/portal-tokens", {
        customerId: tokForm.customerId, label: tokForm.label.trim(), expiresInDays: Number(tokForm.expiresInDays) || 30,
        scopes: ["quotes", "agreements", "reports", "invoices"],
      });
      setIssuedToken(res.token);
      setRev((r) => r + 1);
    } catch (err) { setError((err as Error).message); }
  }

  async function revokeToken(id: string) {
    setError("");
    try {
      await api("POST", `/api/business/portal-tokens/${id}/revoke`, {});
      setRev((r) => r + 1);
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Business Owner Hub (M8)</h1>
          <p class="workspace-help">Executive visibility across dispatch, sales, contracts, labor, inventory, projects, reporting, automations, and customer portal access.</p>
        </div>
      </header>

      {error && <Notice tone="danger">{error}</Notice>}

      <nav class="project-tabs" role="tablist">
        {([
          ["dashboard", "Executive Dashboard"],
          ["reports", "Saved Reports"],
          ["automations", "Automations"],
          ["portal", "Customer Portal"],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} class={"project-tab" + (tab === id ? " is-active" : "")} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {tab === "dashboard" && dash && (
        <div class="project-tab-stack">
          <p class="workspace-help">{dash.note} Computed: {dash.computedAt?.slice(0, 19).replace("T", " ")} UTC.</p>
          <div class="project-pl">
            <div onClick={() => navigate("/dispatcher")} style={{ cursor: "pointer" }}><span>Unassigned / Overdue Jobs</span><strong>{dash.dispatch.unassignedJobs} / {dash.dispatch.overdueJobs}</strong></div>
            <div onClick={() => navigate("/sales")} style={{ cursor: "pointer" }}><span>Open Sales Pipeline</span><strong>{money(dash.pipeline.openValueCents)} ({dash.pipeline.openCount})</strong></div>
            <div onClick={() => navigate("/agreements")} style={{ cursor: "pointer" }}><span>Agreements Renewing (60d)</span><strong>{dash.agreements.renewingWithin60Days} / {dash.agreements.total}</strong></div>
            <div onClick={() => navigate("/invoices")} style={{ cursor: "pointer" }}><span>Outstanding / Overdue AR</span><strong>{money(dash.financials.outstandingCents)} / {money(dash.financials.overdueCents)}</strong></div>
            <div onClick={() => navigate("/timesheets")} style={{ cursor: "pointer" }}><span>Pending Time Approvals</span><strong>{dash.labor.pendingTimeApprovals}</strong></div>
            <div onClick={() => navigate("/inventory")} style={{ cursor: "pointer" }}><span>Low-Stock Alerts</span><strong>{dash.inventory.lowStockCount}</strong></div>
            <div onClick={() => navigate("/purchasing")} style={{ cursor: "pointer" }}><span>Open PO Commitments</span><strong>{money(dash.inventory.openPoCommitmentCents)} ({dash.inventory.openPoCount})</strong></div>
            <div onClick={() => navigate("/projects")} style={{ cursor: "pointer" }}><span>Active Projects / Pay Apps</span><strong>{dash.projects.activeCount} / {dash.projects.pendingBillingApps}</strong></div>
            <div onClick={() => navigate("/residential")} style={{ cursor: "pointer" }}><span>Residential Memberships / Open Calls</span><strong>{dash.residential.activeMemberships} / {dash.residential.openBookings}</strong></div>
          </div>
        </div>
      )}

      {tab === "reports" && (
        <div class="project-tab-stack">
          <form class="sales-form" onSubmit={saveReport}>
            <div class="sales-form-grid">
              <TextField label="Report name" value={repForm.name} onInput={(e) => setRepForm({ ...repForm, name: (e.target as HTMLInputElement).value })} />
              <Select label="Dataset" value={repForm.dataset} options={["invoices", "jobs", "opportunities", "inventory", "labor", "projects", "residential"].map((v) => ({ value: v, label: v }))} onValueChange={(dataset) => setRepForm({ ...repForm, dataset })} />
              <Select label="Schedule" value={repForm.schedule} options={["manual", "daily", "weekly", "monthly"].map((v) => ({ value: v, label: v }))} onValueChange={(schedule) => setRepForm({ ...repForm, schedule })} />
            </div>
            <div><Button variant="primary" type="submit"><Plus size={14} /> Save report definition</Button></div>
          </form>
          <Table label="Saved reports">
            <thead><tr><th>Name</th><th>Dataset</th><th>Schedule</th><th>Export</th></tr></thead>
            <tbody>{reports.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.name}</th>
                <td><Badge tone="info">{r.dataset}</Badge></td>
                <td>{r.schedule}</td>
                <td>
                  <div class="btn-row">
                    <a class="btn btn-ghost" href={`/api/business/reports/${r.id}/export?format=csv`}><Download size={13} /> CSV</a>
                    <a class="btn btn-ghost" href={`/api/business/reports/${r.id}/export?format=json`} target="_blank" rel="noopener">JSON</a>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </Table>
        </div>
      )}

      {tab === "automations" && (
        <div class="project-tab-stack">
          <form class="sales-form" onSubmit={saveAutomation}>
            <div class="sales-form-grid">
              <TextField label="Rule name" value={autoForm.name} onInput={(e) => setAutoForm({ ...autoForm, name: (e.target as HTMLInputElement).value })} />
              <Select label="Trigger" value={autoForm.triggerKind} options={[
                { value: "invoice_overdue", label: "Overdue invoices" },
                { value: "agreement_renewal_due", label: "Agreement renewal due (60d)" },
                { value: "inventory_low_stock", label: "Low stock alert" },
                { value: "job_unassigned", label: "Unassigned jobs" },
                { value: "booking_urgent", label: "Urgent residential bookings" },
              ]} onValueChange={(triggerKind) => setAutoForm({ ...autoForm, triggerKind })} />
              <Select label="Action" value={autoForm.actionKind} options={[
                { value: "flag_review", label: "Flag for review" },
                { value: "notify_owner", label: "Notify owner" },
                { value: "create_task", label: "Create follow-up task" },
              ]} onValueChange={(actionKind) => setAutoForm({ ...autoForm, actionKind })} />
            </div>
            <div><Button variant="primary" type="submit"><Plus size={14} /> Save automation rule</Button></div>
          </form>
          {dryRunResult && (
            <Notice tone="info">Dry-run matched <strong>{dryRunResult.matchedCount}</strong> native record(s). {dryRunResult.note}</Notice>
          )}
          <Table label="Automations">
            <thead><tr><th>Rule</th><th>Trigger</th><th>Action</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{automations.map((a) => (
              <tr key={a.id}>
                <th scope="row">{a.name}</th>
                <td>{a.triggerKind}</td>
                <td>{a.actionKind}</td>
                <td><Badge tone={a.enabled ? "success" : "neutral"}>{a.enabled ? "Enabled" : "Disabled"}</Badge></td>
                <td>
                  <div class="btn-row">
                    <Button variant="ghost" onClick={() => void dryRun(a.id)}><Play size={13} /> Dry-run preview</Button>
                    <Button variant="ghost" onClick={() => void toggleAutomation(a)}>{a.enabled ? "Disable" : "Enable"}</Button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </Table>
        </div>
      )}

      {tab === "portal" && (
        <div class="project-tab-stack">
          <form class="sales-form" onSubmit={issueToken}>
            <div class="sales-form-grid">
              <Select label="Customer" value={tokForm.customerId} options={customers.map((c) => ({ value: c.id, label: c.name }))} onValueChange={(customerId) => setTokForm({ ...tokForm, customerId })} />
              <TextField label="Token label" value={tokForm.label} onInput={(e) => setTokForm({ ...tokForm, label: (e.target as HTMLInputElement).value })} />
              <TextField label="Expires in (days)" type="number" value={tokForm.expiresInDays} onInput={(e) => setTokForm({ ...tokForm, expiresInDays: (e.target as HTMLInputElement).value })} />
            </div>
            <div><Button variant="primary" type="submit"><KeyRound size={14} /> Issue customer portal token</Button></div>
          </form>
          {issuedToken && (
            <Notice tone="success">
              Copy this token now (stored hashed only): <code>{issuedToken}</code> — test via <code>/api/portal/me?token={issuedToken}</code>
            </Notice>
          )}
          <Table label="Issued portal tokens">
            <thead><tr><th>Customer</th><th>Label</th><th>Expires</th><th>Status</th><th></th></tr></thead>
            <tbody>{tokens.map((t) => (
              <tr key={t.id}>
                <th scope="row">{t.customerName || t.customerId}</th>
                <td>{t.label}</td>
                <td>{t.expiresAt?.slice(0, 10)}</td>
                <td><Badge tone={t.active ? "success" : "danger"}>{t.active ? "Active" : "Revoked / Expired"}</Badge></td>
                <td>{t.active && <Button variant="ghost" onClick={() => void revokeToken(t.id)}>Revoke</Button>}</td>
              </tr>
            ))}</tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
