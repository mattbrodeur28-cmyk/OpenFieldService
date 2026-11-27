import { useState } from "preact/hooks";
import { PersonnelDocumentsDialog } from "./personnel-documents";
import { Timesheets } from "./timesheets";
import { useAccount, canManagePeople } from '../auth';
import { useConnectivity } from "../hooks/use-connectivity";
import { useApp } from '../context';
import { Button } from './ui/button';
import { TextField } from './ui/input';
import { Badge, Table, EmptyState } from './ui/surfaces';
import { Dialog, DialogTitle } from "./ui/dialog";
import { Plus } from "lucide-preact";

const COLORS = ["#16a34a", "#2563eb", "#db2777", "#7c3aed", "#0891b2", "#ea580c"];

export function TechnicianList() {
  const { technicians, addTechnician, navigate } = useApp();
  const { user } = useAccount();
  const { readOnly } = useConnectivity();
  const [view, setView] = useState<"directory" | "timesheets">("directory");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", color: COLORS[0] });
  const [error, setError] = useState("");
  const [documents, setDocuments] = useState<{ id: string; name: string } | null>(null);
  const canWrite = user.role !== "viewer" && user.active && !user.mustChangePassword && !readOnly;

  async function create() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    setError("");
    try {
      await addTechnician({ name: form.name.trim(), email: form.email, phone: form.phone, color: form.color });
      setCreating(false);
      setForm({ name: "", email: "", phone: "", color: COLORS[0] });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div class="page">
      <header class="page-header">
        <div><h1>Technicians</h1><p class="workspace-help">Field team, availability and weekly timecards.</p></div>
        <div class="page-header-right">
          <div class="segmented" role="tablist" aria-label="Technicians view">
            <button role="tab" aria-selected={view === "directory"} class={"segmented-item" + (view === "directory" ? " is-active" : "")} onClick={() => setView("directory")}>Directory</button>
            <button role="tab" aria-selected={view === "timesheets"} class={"segmented-item" + (view === "timesheets" ? " is-active" : "")} onClick={() => setView("timesheets")}>Timesheets</button>
          </div>
          {view === "directory" && <Button variant="primary" disabled={!canWrite} onClick={() => setCreating(true)}><Plus size={16} /> New technician</Button>}
        </div>
      </header>

      {view === "timesheets" ? <Timesheets /> : technicians.length ? (
        <Table label="Field Service technicians">
          <thead><tr><th>Color</th><th>Name</th><th>Email</th><th>Phone</th><th>Open jobs</th><th>Availability</th>{canManagePeople(user) && <th>Personnel</th>}</tr></thead>
          <tbody>{technicians.map((t) => (
            <tr key={t.id} class="table-row clickable" onClick={() => navigate(`/technicians/${t.id}`)}>
              <td><span class="color-swatch" style={{ background: t.color }} /></td>
              <th scope="row">{t.name}</th>
              <td>{t.email || "—"}</td>
              <td>{t.phone || "—"}</td>
              <td>{t.job_count ?? 0}</td>
              <td><Badge tone={t.active ? "success" : "neutral"}>{t.active ? "Available" : "Unavailable"}</Badge></td>
              {canManagePeople(user) && <td onClick={(e) => e.stopPropagation()}><Button onClick={() => setDocuments({ id: t.id, name: t.name })}>Documents</Button></td>}
            </tr>
          ))}</tbody>
        </Table>
      ) : <EmptyState title="No technicians yet">Add your first technician to start scheduling.</EmptyState>}

      {creating && (
        <Dialog class="project-form" close={() => setCreating(false)}>
          <DialogTitle>New technician</DialogTitle>
          <form class="sales-form" onSubmit={(e) => { e.preventDefault(); void create(); }}>
            <TextField label="Name" value={form.name} onInput={(e) => setForm({ ...form, name: (e.target as HTMLInputElement).value })} />
            <TextField label="Email" type="email" value={form.email} onInput={(e) => setForm({ ...form, email: (e.target as HTMLInputElement).value })} />
            <TextField label="Phone" type="tel" value={form.phone} onInput={(e) => setForm({ ...form, phone: (e.target as HTMLInputElement).value })} />
            <label class="ui-field"><span>Color</span><input type="color" value={form.color} onInput={(e) => setForm({ ...form, color: (e.target as HTMLInputElement).value })} /></label>
            {error && <p class="workspace-error" role="alert">{error}</p>}
            <div class="dialog-actions">
              <Button onClick={() => setCreating(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={!canWrite}><Plus size={14} /> Create technician</Button>
            </div>
          </form>
        </Dialog>
      )}
      {documents && <PersonnelDocumentsDialog staffId={documents.id} name={documents.name} close={() => setDocuments(null)} />}
    </div>
  );
}
