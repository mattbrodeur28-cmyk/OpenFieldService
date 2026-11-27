import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { useAccount, isAdministrator } from "../auth";
import { useConnectivity } from "../hooks/use-connectivity";
import { Button } from "./ui/button";
import { TextField } from "./ui/input";
import { Select } from "./ui/select";
import { Badge, Notice, Table } from "./ui/surfaces";
import { Plus, Download, Snowflake, Cylinder, Activity } from "lucide-preact";

const uuid = () => crypto.randomUUID();
const oz = (tenths?: number | null) => tenths == null ? "Unknown" : `${(tenths / 10).toFixed(1)} oz (${(tenths / 160).toFixed(2)} lb)`;

export function RmsPage() {
  const { user } = useAccount();
  const { readOnly } = useConnectivity();
  const canWrite = user.role !== "viewer" && user.active && !user.mustChangePassword && !readOnly;
  const admin = isAdministrator(user) && !readOnly;

  const [tab, setTab] = useState<"dashboard" | "cylinders" | "events" | "rules">("dashboard");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [rev, setRev] = useState(0);

  const [refForm, setRefForm] = useState({ code: "R-410A", name: "R-410A (HFC Blend)", gwp: "2088" });
  const [cylForm, setCylForm] = useState({ tag: "", refrigerantId: "", status: "virgin", capacityOz: "400", currentOz: "400", certRef: "" });
  const [evForm, setEvForm] = useState({ eventType: "addition", refrigerantId: "", cylinderId: "", massOz: "16", reason: "Service charge addition" });
  const [ruleForm, setRuleForm] = useState({ code: "EPA-608-COMFORT", effectiveDate: "2026-01-01", equipmentClass: "comfort_cooling", thresholdLb: "50", maxLeakPct: "10", deadlineDays: "30" });

  useEffect(() => {
    let live = true;
    setError("");
    void api<any>("GET", "/api/rms/dashboard")
      .then((res) => { if (live) setData(res); })
      .catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [rev]);

  async function saveRefrigerant(e: Event) {
    e.preventDefault();
    setError("");
    try {
      await api("POST", "/api/rms/refrigerants", { code: refForm.code, name: refForm.name, gwp: parseInt(refForm.gwp, 10) || 0, ozoneDepleting: false });
      setRev((r) => r + 1);
    } catch (err) { setError((err as Error).message); }
  }

  async function saveCylinder(e: Event) {
    e.preventDefault();
    if (!cylForm.tag.trim() || !cylForm.refrigerantId) return;
    setError("");
    try {
      await api("POST", "/api/rms/cylinders", {
        tag: cylForm.tag.trim(), refrigerantId: cylForm.refrigerantId, status: cylForm.status,
        tareTenthsOz: 0, capacityTenthsOz: Math.round((parseFloat(cylForm.capacityOz) || 0) * 10),
        currentMassTenthsOz: Math.round((parseFloat(cylForm.currentOz) || 0) * 10),
        locationId: null, technicianId: null, certificationRef: cylForm.certRef, supplierDocRef: "",
      });
      setCylForm({ ...cylForm, tag: "" });
      setRev((r) => r + 1);
    } catch (err) { setError((err as Error).message); }
  }

  async function recordEvent(e: Event) {
    e.preventDefault();
    if (!evForm.refrigerantId) return;
    setError("");
    try {
      await api("POST", "/api/rms/events", {
        requestKey: uuid(), eventType: evForm.eventType, refrigerantId: evForm.refrigerantId,
        cylinderId: evForm.cylinderId || null, assetId: null, jobId: null, technicianId: null, locationId: null,
        massTenthsOz: Math.round((parseFloat(evForm.massOz) || 0) * 10),
        eventAt: new Date().toISOString(), reason: evForm.reason, evidenceRef: "", certificationRef: "",
      });
      setRev((r) => r + 1);
    } catch (err) { setError((err as Error).message); }
  }

  async function saveRule(e: Event) {
    e.preventDefault();
    setError("");
    try {
      await api("POST", "/api/rms/rules", {
        code: ruleForm.code, version: 1, jurisdiction: "US-EPA-608",
        effectiveDate: ruleForm.effectiveDate, equipmentClass: ruleForm.equipmentClass,
        chargeThresholdTenthsOz: Math.round((parseFloat(ruleForm.thresholdLb) || 0) * 160),
        maxLeakRateBps: Math.round((parseFloat(ruleForm.maxLeakPct) || 0) * 100),
        repairDeadlineDays: parseInt(ruleForm.deadlineDays, 10) || 30,
        sourceUrl: "https://www.epa.gov/section608/recordkeeping-and-reporting-requirements-stationary-refrigeration",
        notes: "Configured regulatory threshold rule", active: true,
      });
      setRev((r) => r + 1);
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <h1><Snowflake size={18} style={{ marginRight: "6px" }} />Refrigerant Monitoring System (M14)</h1>
          <p class="workspace-help">Controlled refrigerant catalog, serialized cylinders, equipment charge baselines, balanced field events, and leak-rate monitoring.</p>
        </div>
        <div class="page-header-right">
          <a class="btn btn-ghost" href="/api/rms/export?format=csv"><Download size={14} /> Export CSV ledger</a>
        </div>
      </header>

      {error && <Notice tone="danger">{error}</Notice>}
      {data && <Notice tone="info">{data.disclaimer}</Notice>}

      {data && (
        <div class="project-pl" style={{ margin: "12px 0" }}>
          <div><span>Cylinders Tracked</span><strong>{data.kpis.cylindersTotal}</strong></div>
          <div><span>Equipment Baselines</span><strong>{data.kpis.equipmentTracked} ({data.kpis.unknownChargeCount} unknown charge)</strong></div>
          <div><span>Leak Rate Exceeded</span><strong class={data.kpis.leakExceededCount > 0 ? "project-margin-neg" : ""}>{data.kpis.leakExceededCount}</strong></div>
          <div><span>Total Added</span><strong>{oz(data.kpis.totalAddedTenthsOz)}</strong></div>
          <div><span>Total Recovered</span><strong>{oz(data.kpis.totalRecoveredTenthsOz)}</strong></div>
        </div>
      )}

      <nav class="project-tabs" role="tablist">
        {([
          ["dashboard", "Stock & Equipment"],
          ["cylinders", "Refrigerants & Cylinders"],
          ["events", "Field Ledger"],
          ["rules", "Regulatory Rules"],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} class={"project-tab" + (tab === id ? " is-active" : "")} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {tab === "dashboard" && data && (
        <div class="project-tab-stack">
          <Table label="Refrigerant stock by type">
            <thead><tr><th>Refrigerant</th><th>Cylinders</th><th>Virgin / Reclaimed</th><th>Recovered</th></tr></thead>
            <tbody>{data.stockByRefrigerant.map((s: any) => (
              <tr key={s.refrigerantId}>
                <th scope="row">{s.code} · {s.name}</th>
                <td>{s.cylinderCount}</td>
                <td>{oz(s.virginTenthsOz)}</td>
                <td>{oz(s.recoveredTenthsOz)}</td>
              </tr>
            ))}</tbody>
          </Table>

          <Table label="Equipment baselines and 12-month leak status">
            <thead><tr><th>Equipment</th><th>Customer</th><th>Refrigerant</th><th>Full Charge</th><th>12m Added</th><th>Leak Rate</th><th>Status</th></tr></thead>
            <tbody>{data.equipment.map((e: any) => (
              <tr key={e.assetId}>
                <th scope="row">{e.assetName}</th>
                <td>{e.customerName}</td>
                <td>{e.refrigerantCode}</td>
                <td>{oz(e.fullChargeTenthsOz)}</td>
                <td>{oz(e.additions12mTenthsOz)}</td>
                <td>{e.leakRatePct == null ? "Unknown" : `${e.leakRatePct}%`}</td>
                <td><Badge tone={e.thresholdExceeded ? "danger" : e.status === "unknown_charge" ? "warning" : "success"}>{e.status}</Badge></td>
              </tr>
            ))}</tbody>
          </Table>
        </div>
      )}

      {tab === "cylinders" && data && (
        <div class="project-tab-stack">
          {admin && (
            <form class="sales-form" onSubmit={saveRefrigerant}>
              <div class="sales-form-grid">
                <TextField label="Refrigerant code" value={refForm.code} onInput={(e) => setRefForm({ ...refForm, code: (e.target as HTMLInputElement).value })} />
                <TextField label="Name" value={refForm.name} onInput={(e) => setRefForm({ ...refForm, name: (e.target as HTMLInputElement).value })} />
                <TextField label="GWP" type="number" value={refForm.gwp} onInput={(e) => setRefForm({ ...refForm, gwp: (e.target as HTMLInputElement).value })} />
              </div>
              <div><Button variant="primary" type="submit"><Plus size={14} /> Add refrigerant</Button></div>
            </form>
          )}
          {data.refrigerants.length > 0 && (
            <form class="sales-form" onSubmit={saveCylinder}>
              <div class="sales-form-grid">
                <TextField label="Cylinder tag / serial" value={cylForm.tag} onInput={(e) => setCylForm({ ...cylForm, tag: (e.target as HTMLInputElement).value })} />
                <Select label="Refrigerant" value={cylForm.refrigerantId} options={data.refrigerants.map((r: any) => ({ value: r.id, label: `${r.code} (${r.name})` }))} onValueChange={(refrigerantId) => setCylForm({ ...cylForm, refrigerantId })} />
                <Select label="Status" value={cylForm.status} options={["virgin", "recovered", "reclaimed", "empty"].map((v) => ({ value: v, label: v }))} onValueChange={(status) => setCylForm({ ...cylForm, status })} />
              </div>
              <div class="sales-form-grid">
                <TextField label="Capacity (oz)" type="number" value={cylForm.capacityOz} onInput={(e) => setCylForm({ ...cylForm, capacityOz: (e.target as HTMLInputElement).value })} />
                <TextField label="Current mass (oz)" type="number" value={cylForm.currentOz} onInput={(e) => setCylForm({ ...cylForm, currentOz: (e.target as HTMLInputElement).value })} />
                <TextField label="EPA 608 cert ref" value={cylForm.certRef} onInput={(e) => setCylForm({ ...cylForm, certRef: (e.target as HTMLInputElement).value })} />
              </div>
              <div><Button variant="primary" type="submit" disabled={!canWrite}><Cylinder size={14} /> Register cylinder</Button></div>
            </form>
          )}
          <Table label="Serialized cylinders">
            <thead><tr><th>Tag</th><th>Refrigerant</th><th>Status</th><th>Current Mass</th><th>Capacity</th><th>Cert Ref</th></tr></thead>
            <tbody>{data.cylinders.map((c: any) => (
              <tr key={c.id}>
                <th scope="row">{c.tag}</th>
                <td>{c.refrigerantCode}</td>
                <td><Badge tone={c.status === "recovered" ? "warning" : "info"}>{c.status}</Badge></td>
                <td>{oz(c.currentMassTenthsOz)}</td>
                <td>{oz(c.capacityTenthsOz)}</td>
                <td class="text-muted">{c.certificationRef || "—"}</td>
              </tr>
            ))}</tbody>
          </Table>
        </div>
      )}

      {tab === "events" && data && (
        <div class="project-tab-stack">
          {data.refrigerants.length > 0 && (
            <form class="sales-form" onSubmit={recordEvent}>
              <div class="sales-form-grid">
                <Select label="Event type" value={evForm.eventType} options={["purchase", "transfer", "addition", "recovery", "return", "reclaim", "disposal", "adjustment"].map((v) => ({ value: v, label: v }))} onValueChange={(eventType) => setEvForm({ ...evForm, eventType })} />
                <Select label="Refrigerant" value={evForm.refrigerantId} options={data.refrigerants.map((r: any) => ({ value: r.id, label: r.code }))} onValueChange={(refrigerantId) => setEvForm({ ...evForm, refrigerantId })} />
                <Select label="Cylinder (optional)" value={evForm.cylinderId} options={[{ value: "", label: "None" }, ...data.cylinders.map((c: any) => ({ value: c.id, label: `${c.tag} (${c.refrigerantCode})` }))]} onValueChange={(cylinderId) => setEvForm({ ...evForm, cylinderId })} />
              </div>
              <div class="sales-form-grid">
                <TextField label="Mass (oz)" type="number" value={evForm.massOz} onInput={(e) => setEvForm({ ...evForm, massOz: (e.target as HTMLInputElement).value })} />
                <TextField label="Reason" value={evForm.reason} onInput={(e) => setEvForm({ ...evForm, reason: (e.target as HTMLInputElement).value })} />
              </div>
              <div><Button variant="primary" type="submit" disabled={!canWrite}><Activity size={14} /> Record refrigerant event</Button></div>
            </form>
          )}
          <Table label="Immutable refrigerant event ledger">
            <thead><tr><th>When</th><th>Event</th><th>Refrigerant</th><th>Cylinder</th><th>Equipment</th><th>Mass</th><th>Reason</th></tr></thead>
            <tbody>{data.recentEvents.map((e: any) => (
              <tr key={e.id}>
                <td class="text-muted">{e.eventAt?.slice(0, 10)}</td>
                <td><Badge tone="neutral">{e.eventType}</Badge></td>
                <td>{e.refrigerantCode}</td>
                <td>{e.cylinderTag || "—"}</td>
                <td>{e.assetName || "—"}</td>
                <td>{oz(e.massTenthsOz)}</td>
                <td class="text-muted">{e.reason}</td>
              </tr>
            ))}</tbody>
          </Table>
        </div>
      )}

      {tab === "rules" && data && (
        <div class="project-tab-stack">
          {admin && (
            <form class="sales-form" onSubmit={saveRule}>
              <div class="sales-form-grid">
                <TextField label="Rule code" value={ruleForm.code} onInput={(e) => setRuleForm({ ...ruleForm, code: (e.target as HTMLInputElement).value })} />
                <Select label="Equipment class" value={ruleForm.equipmentClass} options={["comfort_cooling", "commercial_refrigeration", "industrial_process", "other"].map((v) => ({ value: v, label: v }))} onValueChange={(equipmentClass) => setRuleForm({ ...ruleForm, equipmentClass })} />
                <TextField label="Effective date" type="date" value={ruleForm.effectiveDate} onInput={(e) => setRuleForm({ ...ruleForm, effectiveDate: (e.target as HTMLInputElement).value })} />
              </div>
              <div class="sales-form-grid">
                <TextField label="Charge threshold (lb)" type="number" value={ruleForm.thresholdLb} onInput={(e) => setRuleForm({ ...ruleForm, thresholdLb: (e.target as HTMLInputElement).value })} />
                <TextField label="Max annual leak rate (%)" type="number" value={ruleForm.maxLeakPct} onInput={(e) => setRuleForm({ ...ruleForm, maxLeakPct: (e.target as HTMLInputElement).value })} />
                <TextField label="Repair deadline (days)" type="number" value={ruleForm.deadlineDays} onInput={(e) => setRuleForm({ ...ruleForm, deadlineDays: (e.target as HTMLInputElement).value })} />
              </div>
              <div><Button variant="primary" type="submit"><Plus size={14} /> Save regulatory rule</Button></div>
            </form>
          )}
          <Table label="Versioned regulatory rules">
            <thead><tr><th>Code</th><th>Jurisdiction</th><th>Class</th><th>Charge Threshold</th><th>Max Leak</th><th>Deadline</th></tr></thead>
            <tbody>{data.rules.map((r: any) => (
              <tr key={r.id}>
                <th scope="row">{r.code} v{r.version}</th>
                <td>{r.jurisdiction}</td>
                <td>{r.equipmentClass}</td>
                <td>{oz(r.chargeThresholdTenthsOz)}</td>
                <td>{(r.maxLeakRateBps / 100).toFixed(1)}%</td>
                <td>{r.repairDeadlineDays}d</td>
              </tr>
            ))}</tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
