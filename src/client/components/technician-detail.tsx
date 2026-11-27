import { useState } from "preact/hooks";
import { useApp } from "../context";
import { useAccount } from "../auth";
import { useConnectivity } from "../hooks/use-connectivity";
import { Timesheets } from "./timesheets";
import { Badge } from "./ui/surfaces";
import { ArrowLeft, Edit3, Save, X, Trash2, ChevronDown, UserRound } from "lucide-preact";

export function TechnicianDetail({ id }: { id: string }) {
  const { technicians, updateTechnician, deleteTechnician, navigate } = useApp();
  const { user } = useAccount();
  const { readOnly } = useConnectivity();
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ about: true, timesheets: true });
  const [form, setForm] = useState({ name: "", email: "", phone: "", color: "#16a34a", active: 1 });
  const [error, setError] = useState("");
  const technician = technicians.find((t) => t.id === id);
  const canWrite = user.role !== "viewer" && user.active && !user.mustChangePassword && !readOnly;

  if (!technician) return <div class="page"><header class="page-header"><h1>Technician</h1></header><p role="status">Loading technician…</p></div>;

  const startEdit = () => {
    setForm({ name: technician.name, email: technician.email, phone: technician.phone, color: technician.color, active: technician.active ? 1 : 0 });
    setEditing(true);
  };
  const saveEdit = async () => {
    setError("");
    try { await updateTechnician(id, form); setEditing(false); }
    catch (e) { setError((e as Error).message); }
  };
  const toggle = (key: string) => setOpen((o) => ({ ...o, [key]: !o[key] }));

  return (
    <div class="page">
      <div class="record-header account-record-header">
        <div class="record-header-main">
          <button class="btn btn-back" onClick={() => navigate("/technicians")}><ArrowLeft size={16} /> Back</button>
          <span class="account-icon" style={{ background: technician.color }} aria-hidden="true"><UserRound size={20} /></span>
          <div>
            <span class="account-eyebrow">Technician</span>
            <h1 class="record-header-title">{technician.name}</h1>
            <div class="record-header-subtitle">
              <span>{technician.email || "No email"}</span>
              <span>{technician.phone || "No phone"}</span>
              <Badge tone={technician.active ? "success" : "neutral"}>{technician.active ? "Available" : "Unavailable"}</Badge>
            </div>
          </div>
        </div>
        <div class="page-header-right">
          {editing ? (
            <>
              <button class="btn" onClick={() => setEditing(false)}><X size={14} /> Cancel</button>
              <button class="btn btn-primary" onClick={saveEdit}><Save size={14} /> Save</button>
            </>
          ) : (
            <>
              <button class="btn" onClick={startEdit} disabled={!canWrite}><Edit3 size={14} /> Edit</button>
              <button class="btn btn-danger" disabled={!canWrite} onClick={() => deleteTechnician(id).then(() => navigate("/technicians")).catch((e) => setError((e as Error).message))}><Trash2 size={14} /> Deactivate</button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div class="card detail-section">
          <div class="form-grid">
            <div class="form-group full-width"><label>Name</label><input value={form.name} onInput={(e) => setForm({ ...form, name: e.currentTarget.value })} /></div>
            <div class="form-group"><label>Email</label><input type="email" value={form.email} onInput={(e) => setForm({ ...form, email: e.currentTarget.value })} /></div>
            <div class="form-group"><label>Phone</label><input type="tel" value={form.phone} onInput={(e) => setForm({ ...form, phone: e.currentTarget.value })} /></div>
            <div class="form-group"><label>Color</label><input type="color" value={form.color} onInput={(e) => setForm({ ...form, color: e.currentTarget.value })} /></div>
            <div class="form-group"><label>Availability</label><select value={form.active} onChange={(e) => setForm({ ...form, active: Number(e.currentTarget.value) })}><option value={1}>Available</option><option value={0}>Unavailable</option></select></div>
          </div>
          {error && <p class="workspace-error" role="alert">{error}</p>}
        </div>
      ) : (
        <div class="account-layout tech-layout">
          <div class="account-col">
            <section class={"record-section" + (open.about ? " is-open" : "")}>
              <button type="button" class="record-section-heading" aria-expanded={open.about} onClick={() => toggle("about")}>
                <ChevronDown size={16} class={"record-section-chevron" + (open.about ? "" : " is-closed")} /><span class="record-section-title">About</span>
              </button>
              {open.about && (
                <div class="record-section-body">
                  <div class="account-fields">
                    {[["Name", technician.name], ["Email", technician.email], ["Phone", technician.phone], ["Availability", technician.active ? "Available" : "Unavailable"], ["Open jobs", String(technician.job_count ?? 0)]].map(([label, value]) => (
                      <div class="account-field" key={label}>
                        <span class="account-field-label">{label}</span>
                        <span class="account-field-value">{value || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
          <div class="account-col">
            <section class={"record-section" + (open.timesheets ? " is-open" : "")}>
              <button type="button" class="record-section-heading" aria-expanded={open.timesheets} onClick={() => toggle("timesheets")}>
                <ChevronDown size={16} class={"record-section-chevron" + (open.timesheets ? "" : " is-closed")} /><span class="record-section-title">Timesheets</span>
              </button>
              {open.timesheets && <div class="record-section-body tech-timesheet-body"><Timesheets initialTechnician={id} /></div>}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
