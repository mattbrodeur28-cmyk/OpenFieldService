import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { useAccount } from "../auth";
import { useApp } from "../context";
import { useConnectivity } from "../hooks/use-connectivity";
import { Button } from "./ui/button";
import { Dialog, DialogTitle } from "./ui/dialog";
import { TextField } from "./ui/input";
import { Select } from "./ui/select";
import { Badge, EmptyState, Notice, Table } from "./ui/surfaces";
import { Cpu, FileCheck2, FolderArchive, AlertTriangle, PackageCheck, Plus, RefreshCw } from "lucide-preact";

const uuid = () => crypto.randomUUID();
const todayYmd = () => new Date().toISOString().slice(0, 10);

export function ControlsPage() {
  const { user } = useAccount();
  const { customers, navigate } = useApp();
  const { readOnly } = useConnectivity();
  const canWrite = user.role !== "viewer" && !readOnly;
  const isAdmin = ["owner", "admin"].includes(user.role);

  const [tab, setTab] = useState("hierarchy");
  const [rev, setRev] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [summary, setSummary] = useState<any>(null);
  const [systems, setSystems] = useState<any[]>([]);
  const [controllers, setControllers] = useState<any[]>([]);
  const [checkouts, setCheckouts] = useState<any[]>([]);
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [deficiencies, setDeficiencies] = useState<any[]>([]);
  const [maintLinks, setMaintLinks] = useState<any[]>([]);

  const [handoverSysId, setHandoverSysId] = useState("");
  const [handover, setHandover] = useState<any>(null);

  const [modal, setModal] = useState<"" | "system" | "controller" | "checkout" | "artifact" | "deficiency" | "maint">("");
  const [sysForm, setSysForm] = useState({ customerId: "", siteName: "", buildingName: "", systemName: "", systemType: "hvac_bas", status: "commissioning", notes: "" });
  const [ctrlForm, setCtrlForm] = useState({ systemId: "", tag: "", manufacturer: "", model: "", protocol: "BACnet/IP", networkAddress: "", deviceInstance: "", pointCount: "0", firmwareVersion: "", softwareVersion: "", secretRef: "", status: "commissioning" });
  const [chkForm, setChkForm] = useState({ controllerId: "", templateVersion: "v1.0", testType: "point_to_point", point: "Supply Air Temp", expected: "55°F", actual: "55.2°F", evidenceNotes: "" });
  const [artForm, setArtForm] = useState({ systemId: "", controllerId: "", kind: "backup", filename: "", provenance: "Commissioning field backup", retentionPolicy: "7_years", approved: true });
  const [defForm, setDefForm] = useState({ systemId: "", controllerId: "", severity: "major", title: "", description: "", evidenceRef: "", ownerName: "" });
  const [maintForm, setMaintForm] = useState({ controllerId: "", templateName: "Quarterly BAS PM", templateVersion: "v2.1", notes: "" });

  useEffect(() => {
    let live = true;
    setError("");
    Promise.all([
      api<any>("GET", "/api/controls/summary"),
      api<{ rows: any[] }>("GET", "/api/controls/systems"),
      api<{ rows: any[] }>("GET", "/api/controls/controllers"),
      api<{ rows: any[] }>("GET", "/api/controls/checkouts"),
      api<{ rows: any[] }>("GET", "/api/controls/artifacts"),
      api<{ rows: any[] }>("GET", "/api/controls/deficiencies"),
      api<{ rows: any[] }>("GET", "/api/controls/maintenance-links"),
    ])
      .then(([s, sys, ctrls, chks, arts, defs, ml]) => {
        if (!live) return;
        setSummary(s);
        setSystems(sys.rows || []);
        setControllers(ctrls.rows || []);
        setCheckouts(chks.rows || []);
        setArtifacts(arts.rows || []);
        setDeficiencies(defs.rows || []);
        setMaintLinks(ml.rows || []);
        if (!handoverSysId && sys.rows?.[0]?.id) setHandoverSysId(sys.rows[0].id);
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [rev]);

  useEffect(() => {
    if (tab !== "handover" || !handoverSysId) return;
    let live = true;
    api<any>("GET", `/api/controls/systems/${handoverSysId}/handover`)
      .then((h) => {
        if (live) setHandover(h);
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [tab, handoverSysId, rev]);

  const reload = (msg: string) => {
    setModal("");
    setNotice(msg);
    setRev((r) => r + 1);
  };

  async function submitSystem(e: Event) {
    e.preventDefault();
    try {
      await api("POST", "/api/controls/systems", {
        requestKey: uuid(),
        customerId: sysForm.customerId || customers[0]?.id,
        siteName: sysForm.siteName,
        buildingName: sysForm.buildingName,
        systemName: sysForm.systemName,
        systemType: sysForm.systemType,
        status: sysForm.status,
        notes: sysForm.notes,
      });
      setSysForm({ customerId: "", siteName: "", buildingName: "", systemName: "", systemType: "hvac_bas", status: "commissioning", notes: "" });
      reload("Building/system created.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function submitController(e: Event) {
    e.preventDefault();
    try {
      await api("POST", "/api/controls/controllers", {
        requestKey: uuid(),
        systemId: ctrlForm.systemId || systems[0]?.id,
        tag: ctrlForm.tag,
        manufacturer: ctrlForm.manufacturer,
        model: ctrlForm.model,
        protocol: ctrlForm.protocol,
        networkAddress: ctrlForm.networkAddress,
        deviceInstance: ctrlForm.deviceInstance,
        pointCount: Number(ctrlForm.pointCount || 0),
        firmwareVersion: ctrlForm.firmwareVersion,
        softwareVersion: ctrlForm.softwareVersion,
        secretRef: ctrlForm.secretRef,
        status: ctrlForm.status,
      });
      setCtrlForm({ systemId: "", tag: "", manufacturer: "", model: "", protocol: "BACnet/IP", networkAddress: "", deviceInstance: "", pointCount: "0", firmwareVersion: "", softwareVersion: "", secretRef: "", status: "commissioning" });
      reload("Controller registered.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function submitCheckout(e: Event) {
    e.preventDefault();
    try {
      await api("POST", "/api/controls/checkouts", {
        requestKey: uuid(),
        controllerId: chkForm.controllerId || controllers[0]?.id,
        templateVersion: chkForm.templateVersion,
        testType: chkForm.testType,
        readings: chkForm.point ? [{ point: chkForm.point, expected: chkForm.expected, actual: chkForm.actual, pass: true }] : [],
        evidenceNotes: chkForm.evidenceNotes,
        status: "submitted",
      });
      reload("Checkout sheet submitted for sign-off.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function reviewCheckout(id: string, decision: "approved" | "rejected") {
    try {
      await api("POST", `/api/controls/checkouts/${id}/review`, {
        requestKey: uuid(),
        decision,
        signoffNotes: decision === "approved" ? "Verified readings and sequence sign-off." : "Returned for retest.",
      });
      reload(`Checkout ${decision}.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function submitArtifact(e: Event) {
    e.preventDefault();
    try {
      await api("POST", "/api/controls/artifacts", {
        requestKey: uuid(),
        systemId: artForm.systemId || systems[0]?.id,
        controllerId: artForm.controllerId || null,
        kind: artForm.kind,
        filename: artForm.filename,
        provenance: artForm.provenance,
        retentionPolicy: artForm.retentionPolicy,
        approved: artForm.approved && isAdmin,
      });
      setArtForm({ systemId: "", controllerId: "", kind: "backup", filename: "", provenance: "Commissioning field backup", retentionPolicy: "7_years", approved: true });
      reload("Versioned drawing/backup recorded with SHA-256 hash.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function submitDeficiency(e: Event) {
    e.preventDefault();
    try {
      await api("POST", "/api/controls/deficiencies", {
        requestKey: uuid(),
        systemId: defForm.systemId || systems[0]?.id,
        controllerId: defForm.controllerId || null,
        severity: defForm.severity,
        title: defForm.title,
        description: defForm.description,
        evidenceRef: defForm.evidenceRef,
        ownerName: defForm.ownerName,
      });
      setDefForm({ systemId: "", controllerId: "", severity: "major", title: "", description: "", evidenceRef: "", ownerName: "" });
      reload("Deficiency logged.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function scheduleCorrective(id: string) {
    try {
      const res = await api<{ jobIdentifier: string }>("POST", `/api/controls/deficiencies/${id}/corrective-job`, {
        requestKey: uuid(),
        scheduledDate: todayYmd(),
        scheduledTime: "09:00",
        technicianId: null,
      });
      reload(`Corrective work order ${res.jobIdentifier} created and sent to Dispatch.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function closeDeficiency(id: string) {
    try {
      await api("POST", `/api/controls/deficiencies/${id}/close`, {
        requestKey: uuid(),
        retestNotes: "Retested in field and verified within tolerance.",
      });
      reload("Deficiency closed after retest.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function submitMaint(e: Event) {
    e.preventDefault();
    try {
      await api("POST", "/api/controls/maintenance-links", {
        requestKey: uuid(),
        controllerId: maintForm.controllerId || controllers[0]?.id,
        templateName: maintForm.templateName,
        templateVersion: maintForm.templateVersion,
        notes: maintForm.notes,
      });
      reload("Maintenance template version recorded.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function downloadHandover() {
    if (!handover) return;
    const blob = new Blob([JSON.stringify(handover, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `handover-${(handover.system?.building_name || "system").replace(/\W+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div class="page">
      <header class="dispatch-title">
        <div>
          <h1>Controls, Commissioning &amp; Handover</h1>
          <p class="workspace-help">Building → system → controller inventory, point-to-point checkouts, versioned backups, deficiencies, and traceable handover packages.</p>
        </div>
        <div class="btn-row">
          <Button variant="ghost" onClick={() => setRev((r) => r + 1)}><RefreshCw size={14} /> Refresh</Button>
          {canWrite && (
            <>
              <Button onClick={() => setModal("system")}><Plus size={14} /> System</Button>
              <Button variant="primary" disabled={!systems.length} onClick={() => setModal("controller")}><Plus size={14} /> Controller</Button>
            </>
          )}
        </div>
      </header>

      {error && <Notice tone="danger" close={() => setError("")}>{error}</Notice>}
      {notice && <Notice tone="success" close={() => setNotice("")}>{notice}</Notice>}

      {summary && (
        <div class="project-kpis" style={{ marginBottom: "14px" }}>
          <div class="card"><small class="text-muted">Buildings / Systems</small><strong>{summary.systems}</strong></div>
          <div class="card"><small class="text-muted">Controllers</small><strong>{summary.controllers}</strong></div>
          <div class="card"><small class="text-muted">Approved Checkouts</small><strong>{summary.approvedCheckouts} / {summary.approvedCheckouts + summary.pendingCheckouts}</strong></div>
          <div class="card"><small class="text-muted">Drawings &amp; Backups</small><strong>{summary.artifacts}</strong></div>
          <div class="card"><small class="text-muted">Open Deficiencies</small><strong>{summary.openDeficiencies}</strong></div>
        </div>
      )}

      <div class="st-pipeline-tabs" role="tablist" aria-label="Controls workspace sections">
        {[
          { value: "hierarchy", label: "Hierarchy & Controllers", icon: <Cpu size={14} /> },
          { value: "checkouts", label: "Checkouts & Sign-off", icon: <FileCheck2 size={14} /> },
          { value: "artifacts", label: "Drawings & Backups", icon: <FolderArchive size={14} /> },
          { value: "deficiencies", label: "Deficiencies", icon: <AlertTriangle size={14} /> },
          { value: "handover", label: "Handover Package", icon: <PackageCheck size={14} /> },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={tab === item.value}
            class={"st-pill-tab" + (tab === item.value ? " is-active" : "")}
            onClick={() => setTab(item.value)}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>

      {tab === "hierarchy" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "14px" }}>
          <section class="card">
            <h3>Building &amp; System Hierarchy</h3>
            {systems.length ? (
              <Table label="Control systems">
                <thead>
                  <tr><th>Customer</th><th>Building / Site</th><th>System</th><th>Type</th><th>Controllers</th><th>Open Deficiencies</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {systems.map((s) => (
                    <tr key={s.id}>
                      <td><strong>{s.customer_name}</strong></td>
                      <td>{s.building_name}{s.site_name ? ` (${s.site_name})` : ""}</td>
                      <td>{s.system_name}</td>
                      <td>{s.system_type}</td>
                      <td>{s.controller_count}</td>
                      <td><Badge tone={s.open_deficiencies > 0 ? "warning" : "success"}>{s.open_deficiencies}</Badge></td>
                      <td><Badge>{s.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState title="No building systems yet">Add a building and control system to register BACnet/Modbus controllers.</EmptyState>
            )}
          </section>

          <section class="card">
            <div class="btn-row" style={{ justifyContent: "space-between", marginBottom: "8px" }}>
              <h3>Controller Inventory</h3>
              {canWrite && controllers.length > 0 && (
                <Button variant="ghost" onClick={() => setModal("maint")}><Plus size={14} /> Record PM Template Version</Button>
              )}
            </div>
            {controllers.length ? (
              <Table label="Controllers">
                <thead>
                  <tr><th>Tag</th><th>Building / System</th><th>Make / Model</th><th>Protocol &amp; Address</th><th>Points</th><th>Firmware</th><th>Secret Ref</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {controllers.map((k) => (
                    <tr key={k.id}>
                      <td><strong>{k.tag}</strong></td>
                      <td>{k.building_name} · {k.system_name}</td>
                      <td>{k.manufacturer} {k.model}</td>
                      <td>{k.protocol} {k.network_address ? `(${k.network_address})` : ""} {k.device_instance ? `ID:${k.device_instance}` : ""}</td>
                      <td>{k.point_count}</td>
                      <td>{k.firmware_version || "—"}</td>
                      <td class="text-muted">{k.secret_ref || "Vault not linked"}</td>
                      <td><Badge>{k.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState title="No controllers registered">Register a controller under a building system.</EmptyState>
            )}
          </section>
        </div>
      )}

      {tab === "checkouts" && (
        <section class="card" style={{ marginTop: "14px" }}>
          <div class="btn-row" style={{ justifyContent: "space-between", marginBottom: "10px" }}>
            <h3>Point-to-Point &amp; Sequence Checkouts</h3>
            {canWrite && controllers.length > 0 && (
              <Button variant="primary" onClick={() => setModal("checkout")}><Plus size={14} /> New Checkout</Button>
            )}
          </div>
          {checkouts.length ? (
            <Table label="Controller checkouts">
              <thead>
                <tr><th>Controller</th><th>System</th><th>Test Type</th><th>Template</th><th>Readings</th><th>Status</th><th>Action</th></tr>
              </thead>
              <tbody>
                {checkouts.map((ch) => (
                  <tr key={ch.id}>
                    <td><strong>{ch.controller_tag}</strong></td>
                    <td>{ch.building_name} · {ch.system_name}</td>
                    <td>{ch.test_type.replaceAll("_", " ")}</td>
                    <td>{ch.template_version}</td>
                    <td>{(ch.readings || []).length} pts</td>
                    <td><Badge tone={ch.status === "approved" ? "success" : ch.status === "rejected" ? "danger" : "warning"}>{ch.status}</Badge></td>
                    <td>
                      {isAdmin && ch.status !== "approved" && (
                        <div class="btn-row">
                          <Button variant="primary" onClick={() => void reviewCheckout(ch.id, "approved")}>Approve</Button>
                          <Button variant="ghost" onClick={() => void reviewCheckout(ch.id, "rejected")}>Reject</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="No checkout sheets yet">Submit a point-to-point or sequence checkout sheet for review and sign-off.</EmptyState>
          )}
        </section>
      )}

      {tab === "artifacts" && (
        <section class="card" style={{ marginTop: "14px" }}>
          <div class="btn-row" style={{ justifyContent: "space-between", marginBottom: "10px" }}>
            <h3>Versioned Drawings &amp; Controller Backups</h3>
            {canWrite && systems.length > 0 && (
              <Button variant="primary" onClick={() => setModal("artifact")}><Plus size={14} /> Record Drawing / Backup</Button>
            )}
          </div>
          {artifacts.length ? (
            <Table label="Drawings and backups">
              <thead>
                <tr><th>File</th><th>Ver</th><th>Kind</th><th>System / Controller</th><th>SHA-256</th><th>Retention</th><th>Approved</th></tr>
              </thead>
              <tbody>
                {artifacts.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.filename}</strong></td>
                    <td>v{a.version}</td>
                    <td>{a.kind}</td>
                    <td>{a.building_name}{a.controller_tag ? ` · ${a.controller_tag}` : ""}</td>
                    <td style={{ fontFamily: "monospace", fontSize: "11px" }}>{a.sha256.slice(0, 14)}…</td>
                    <td>{a.retention_policy}</td>
                    <td><Badge tone={a.approved ? "success" : "neutral"}>{a.approved ? "Approved" : "Draft"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="No drawings or backups yet">Record versioned controller backups, sequences, and as-built drawings.</EmptyState>
          )}
        </section>
      )}

      {tab === "deficiencies" && (
        <section class="card" style={{ marginTop: "14px" }}>
          <div class="btn-row" style={{ justifyContent: "space-between", marginBottom: "10px" }}>
            <h3>Commissioning Deficiencies &amp; Corrective Work</h3>
            {canWrite && systems.length > 0 && (
              <Button variant="primary" onClick={() => setModal("deficiency")}><Plus size={14} /> Log Deficiency</Button>
            )}
          </div>
          {deficiencies.length ? (
            <Table label="Deficiencies">
              <thead>
                <tr><th>Severity</th><th>Title</th><th>System / Controller</th><th>Corrective Job</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {deficiencies.map((d) => (
                  <tr key={d.id}>
                    <td><Badge tone={d.severity === "critical" ? "danger" : d.severity === "major" ? "warning" : "neutral"}>{d.severity}</Badge></td>
                    <td><strong>{d.title}</strong><div class="text-muted" style={{ fontSize: "11px" }}>{d.description}</div></td>
                    <td>{d.building_name}{d.controller_tag ? ` · ${d.controller_tag}` : ""}</td>
                    <td>
                      {d.corrective_job_id ? (
                        <Button variant="ghost" onClick={() => navigate(`/jobs/${d.corrective_job_id}`)}>
                          {d.corrective_job_identifier || "Open Job"}
                        </Button>
                      ) : "—"}
                    </td>
                    <td><Badge tone={d.status === "closed" ? "success" : "warning"}>{d.status.replaceAll("_", " ")}</Badge></td>
                    <td>
                      <div class="btn-row">
                        {canWrite && d.status !== "closed" && !d.corrective_job_id && (
                          <Button variant="ghost" onClick={() => void scheduleCorrective(d.id)}>Schedule Corrective</Button>
                        )}
                        {isAdmin && d.status !== "closed" && (
                          <Button variant="primary" onClick={() => void closeDeficiency(d.id)}>Retest &amp; Close</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="No deficiencies logged">Log commissioning deficiencies, schedule corrective jobs, and close after retest.</EmptyState>
          )}
        </section>
      )}

      {tab === "handover" && (
        <section class="card" style={{ marginTop: "14px" }}>
          <div class="btn-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
            <div style={{ minWidth: "280px" }}>
              <Select
                label="Select Building / System for Handover"
                value={handoverSysId}
                options={systems.map((s) => ({ value: s.id, label: `${s.customer_name} — ${s.building_name} / ${s.system_name}` }))}
                onValueChange={setHandoverSysId}
              />
            </div>
            {handover && (
              <Button variant="primary" onClick={downloadHandover}>Export Handover JSON</Button>
            )}
          </div>
          {handover ? (
            <div style={{ display: "grid", gap: "12px" }}>
              <div class="project-kpis">
                <div class="card"><small class="text-muted">Controllers</small><strong>{handover.controllers.length}</strong></div>
                <div class="card"><small class="text-muted">Approved Checkouts</small><strong>{handover.approvedCheckouts.length}</strong></div>
                <div class="card"><small class="text-muted">Approved Drawings/Backups</small><strong>{handover.approvedArtifacts.length}</strong></div>
                <div class="card"><small class="text-muted">Open Deficiencies</small><strong>{handover.openDeficiencies.length}</strong></div>
                <div class="card"><small class="text-muted">PM Template Visits</small><strong>{handover.maintenanceHistory.length}</strong></div>
              </div>
              <p class="workspace-help">
                Generated at {handover.generatedAt} for <strong>{handover.customer?.name}</strong> — {handover.system.building_name} ({handover.system.system_name}). Includes traceable SHA-256 artifact hashes, signed-off checkouts, deficiency closure evidence, and exact PM template versions.
              </p>
            </div>
          ) : (
            <EmptyState title="Select a building system">Create a building/system first to generate a traceable customer handover package.</EmptyState>
          )}
        </section>
      )}

      {modal === "system" && (
        <Dialog close={() => setModal("")}>
          <DialogTitle>Add Building &amp; Control System</DialogTitle>
          <form class="sales-form" onSubmit={submitSystem}>
            <Select label="Customer" value={sysForm.customerId || customers[0]?.id || ""} options={customers.map((c) => ({ value: c.id, label: c.name }))} onValueChange={(v) => setSysForm({ ...sysForm, customerId: v })} />
            <TextField label="Building name" required value={sysForm.buildingName} onInput={(e) => setSysForm({ ...sysForm, buildingName: e.currentTarget.value })} />
            <TextField label="System name (e.g., Central Plant BAS)" required value={sysForm.systemName} onInput={(e) => setSysForm({ ...sysForm, systemName: e.currentTarget.value })} />
            <TextField label="Site / campus (optional)" value={sysForm.siteName} onInput={(e) => setSysForm({ ...sysForm, siteName: e.currentTarget.value })} />
            <div class="dialog-actions">
              <Button onClick={() => setModal("")}>Cancel</Button>
              <Button variant="primary" type="submit">Save System</Button>
            </div>
          </form>
        </Dialog>
      )}

      {modal === "controller" && (
        <Dialog close={() => setModal("")}>
          <DialogTitle>Register Controller</DialogTitle>
          <form class="sales-form" onSubmit={submitController}>
            <Select label="Building / System" value={ctrlForm.systemId || systems[0]?.id || ""} options={systems.map((s) => ({ value: s.id, label: `${s.building_name} · ${s.system_name}` }))} onValueChange={(v) => setCtrlForm({ ...ctrlForm, systemId: v })} />
            <TextField label="Controller tag (e.g., AHU-1-DDC)" required value={ctrlForm.tag} onInput={(e) => setCtrlForm({ ...ctrlForm, tag: e.currentTarget.value })} />
            <div class="sales-form-grid">
              <TextField label="Manufacturer" value={ctrlForm.manufacturer} onInput={(e) => setCtrlForm({ ...ctrlForm, manufacturer: e.currentTarget.value })} />
              <TextField label="Model" value={ctrlForm.model} onInput={(e) => setCtrlForm({ ...ctrlForm, model: e.currentTarget.value })} />
            </div>
            <div class="sales-form-grid">
              <Select label="Protocol" value={ctrlForm.protocol} options={["BACnet/IP", "BACnet/MSTP", "Modbus TCP", "Modbus RTU", "LonWorks", "Proprietary"].map((p) => ({ value: p, label: p }))} onValueChange={(v) => setCtrlForm({ ...ctrlForm, protocol: v })} />
              <TextField label="Network address / IP" value={ctrlForm.networkAddress} onInput={(e) => setCtrlForm({ ...ctrlForm, networkAddress: e.currentTarget.value })} />
            </div>
            <div class="sales-form-grid">
              <TextField label="Device instance" value={ctrlForm.deviceInstance} onInput={(e) => setCtrlForm({ ...ctrlForm, deviceInstance: e.currentTarget.value })} />
              <TextField label="Firmware version" value={ctrlForm.firmwareVersion} onInput={(e) => setCtrlForm({ ...ctrlForm, firmwareVersion: e.currentTarget.value })} />
            </div>
            <TextField label="Vault secret reference (never plaintext password)" value={ctrlForm.secretRef} onInput={(e) => setCtrlForm({ ...ctrlForm, secretRef: e.currentTarget.value })} />
            <div class="dialog-actions">
              <Button onClick={() => setModal("")}>Cancel</Button>
              <Button variant="primary" type="submit">Register Controller</Button>
            </div>
          </form>
        </Dialog>
      )}

      {modal === "checkout" && (
        <Dialog close={() => setModal("")}>
          <DialogTitle>New Checkout Sheet</DialogTitle>
          <form class="sales-form" onSubmit={submitCheckout}>
            <Select label="Controller" value={chkForm.controllerId || controllers[0]?.id || ""} options={controllers.map((k) => ({ value: k.id, label: `${k.tag} (${k.building_name})` }))} onValueChange={(v) => setChkForm({ ...chkForm, controllerId: v })} />
            <div class="sales-form-grid">
              <Select label="Test type" value={chkForm.testType} options={[{ value: "point_to_point", label: "Point-to-point" }, { value: "sequence_of_ops", label: "Sequence of Ops" }, { value: "functional_test", label: "Functional Test" }, { value: "trend_review", label: "Trend Review" }]} onValueChange={(v) => setChkForm({ ...chkForm, testType: v })} />
              <TextField label="Template version" value={chkForm.templateVersion} onInput={(e) => setChkForm({ ...chkForm, templateVersion: e.currentTarget.value })} />
            </div>
            <TextField label="Sample point verified" value={chkForm.point} onInput={(e) => setChkForm({ ...chkForm, point: e.currentTarget.value })} />
            <div class="sales-form-grid">
              <TextField label="Expected" value={chkForm.expected} onInput={(e) => setChkForm({ ...chkForm, expected: e.currentTarget.value })} />
              <TextField label="Actual" value={chkForm.actual} onInput={(e) => setChkForm({ ...chkForm, actual: e.currentTarget.value })} />
            </div>
            <TextField label="Evidence notes" value={chkForm.evidenceNotes} onInput={(e) => setChkForm({ ...chkForm, evidenceNotes: e.currentTarget.value })} />
            <div class="dialog-actions">
              <Button onClick={() => setModal("")}>Cancel</Button>
              <Button variant="primary" type="submit">Submit Checkout</Button>
            </div>
          </form>
        </Dialog>
      )}

      {modal === "artifact" && (
        <Dialog close={() => setModal("")}>
          <DialogTitle>Record Versioned Drawing / Backup</DialogTitle>
          <form class="sales-form" onSubmit={submitArtifact}>
            <Select label="System" value={artForm.systemId || systems[0]?.id || ""} options={systems.map((s) => ({ value: s.id, label: `${s.building_name} · ${s.system_name}` }))} onValueChange={(v) => setArtForm({ ...artForm, systemId: v })} />
            <Select label="Kind" value={artForm.kind} options={[{ value: "backup", label: "Controller backup" }, { value: "drawing", label: "As-built drawing" }, { value: "sequence_doc", label: "Sequence of operations" }, { value: "submittal", label: "Submittal" }]} onValueChange={(v) => setArtForm({ ...artForm, kind: v })} />
            <TextField label="Filename (e.g., AHU-1-backup.bog)" required value={artForm.filename} onInput={(e) => setArtForm({ ...artForm, filename: e.currentTarget.value })} />
            <TextField label="Provenance" value={artForm.provenance} onInput={(e) => setArtForm({ ...artForm, provenance: e.currentTarget.value })} />
            <div class="dialog-actions">
              <Button onClick={() => setModal("")}>Cancel</Button>
              <Button variant="primary" type="submit">Record Artifact</Button>
            </div>
          </form>
        </Dialog>
      )}

      {modal === "deficiency" && (
        <Dialog close={() => setModal("")}>
          <DialogTitle>Log Commissioning Deficiency</DialogTitle>
          <form class="sales-form" onSubmit={submitDeficiency}>
            <Select label="System" value={defForm.systemId || systems[0]?.id || ""} options={systems.map((s) => ({ value: s.id, label: `${s.building_name} · ${s.system_name}` }))} onValueChange={(v) => setDefForm({ ...defForm, systemId: v })} />
            <Select label="Severity" value={defForm.severity} options={["critical", "major", "minor", "observation"].map((v) => ({ value: v, label: v }))} onValueChange={(v) => setDefForm({ ...defForm, severity: v })} />
            <TextField label="Title" required value={defForm.title} onInput={(e) => setDefForm({ ...defForm, title: e.currentTarget.value })} />
            <TextField label="Description" value={defForm.description} onInput={(e) => setDefForm({ ...defForm, description: e.currentTarget.value })} />
            <TextField label="Owner / responsible party" value={defForm.ownerName} onInput={(e) => setDefForm({ ...defForm, ownerName: e.currentTarget.value })} />
            <div class="dialog-actions">
              <Button onClick={() => setModal("")}>Cancel</Button>
              <Button variant="primary" type="submit">Log Deficiency</Button>
            </div>
          </form>
        </Dialog>
      )}

      {modal === "maint" && (
        <Dialog close={() => setModal("")}>
          <DialogTitle>Record Maintenance Template Version</DialogTitle>
          <form class="sales-form" onSubmit={submitMaint}>
            <Select label="Controller" value={maintForm.controllerId || controllers[0]?.id || ""} options={controllers.map((k) => ({ value: k.id, label: `${k.tag} (${k.building_name})` }))} onValueChange={(v) => setMaintForm({ ...maintForm, controllerId: v })} />
            <TextField label="Template name" required value={maintForm.templateName} onInput={(e) => setMaintForm({ ...maintForm, templateName: e.currentTarget.value })} />
            <TextField label="Exact template version" required value={maintForm.templateVersion} onInput={(e) => setMaintForm({ ...maintForm, templateVersion: e.currentTarget.value })} />
            <TextField label="Notes" value={maintForm.notes} onInput={(e) => setMaintForm({ ...maintForm, notes: e.currentTarget.value })} />
            <div class="dialog-actions">
              <Button onClick={() => setModal("")}>Cancel</Button>
              <Button variant="primary" type="submit">Save Maintenance Link</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
