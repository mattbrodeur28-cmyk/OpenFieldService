import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { useAccount } from "../auth";
import { useConnectivity } from "../hooks/use-connectivity";
import { Button } from "./ui/button";
import { TextField } from "./ui/input";
import { Select } from "./ui/select";
import { Badge, Notice } from "./ui/surfaces";
import { Plus, MessageSquare } from "lucide-preact";

const CHANNELS = [
  { value: "call", label: "Phone call" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "portal", label: "Portal" },
  { value: "other", label: "Other" },
];
const DIRECTIONS = [
  { value: "outbound", label: "Outbound" },
  { value: "inbound", label: "Inbound" },
];

export function CustomerCommunications({ customerId }: { customerId: string }) {
  const { user } = useAccount();
  const { readOnly } = useConnectivity();
  const canWrite = user.role !== "viewer" && user.active && !user.mustChangePassword && !readOnly;
  const [rows, setRows] = useState<any[] | null>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ contactId: "", channel: "call", direction: "outbound", subject: "", summary: "", reference: "" });
  const [rev, setRev] = useState(0);

  useEffect(() => {
    let live = true;
    setError("");
    void Promise.all([
      api<{ communications: any[] }>("GET", `/api/service/crm/customers/${customerId}/communications`),
      api<{ contacts: any[] }>("GET", `/api/service/crm/customers/${customerId}/contacts`),
    ]).then(([comms, c]) => {
      if (!live) return;
      setRows(comms.communications || []);
      setContacts(c.contacts || []);
    }).catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [customerId, rev]);

  async function save(e: Event) {
    e.preventDefault();
    if (!form.subject.trim()) { setError("Enter a communication subject."); return; }
    setError("");
    try {
      await api("POST", `/api/service/crm/customers/${customerId}/communications`, {
        contactId: form.contactId || null,
        channel: form.channel,
        direction: form.direction,
        subject: form.subject.trim(),
        summary: form.summary.trim(),
        reference: form.reference.trim(),
        occurredAt: new Date().toISOString(),
      });
      setAdding(false);
      setForm({ contactId: "", channel: "call", direction: "outbound", subject: "", summary: "", reference: "" });
      setRev((r) => r + 1);
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <div class="customer-comms">
      {error && <Notice tone="danger">{error}</Notice>}
      <div class="record-section-toolbar">
        <Button variant="ghost" disabled={!canWrite} onClick={() => setAdding((a) => !a)}><Plus size={14} /> Log communication</Button>
      </div>
      {adding && (
        <form class="sales-form" onSubmit={save} style={{ marginBottom: "12px" }}>
          <div class="sales-form-grid">
            <Select label="Channel" value={form.channel} options={CHANNELS} onValueChange={(channel) => setForm({ ...form, channel })} />
            <Select label="Direction" value={form.direction} options={DIRECTIONS} onValueChange={(direction) => setForm({ ...form, direction })} />
          </div>
          {contacts.length > 0 && (
            <Select label="Contact (enforces outbound consent)" value={form.contactId} options={[{ value: "", label: "Account-level" }, ...contacts.map((c) => ({ value: c.id, label: c.name }))]} onValueChange={(contactId) => setForm({ ...form, contactId })} />
          )}
          <TextField label="Subject" value={form.subject} onInput={(e) => setForm({ ...form, subject: (e.target as HTMLInputElement).value })} />
          <label class="ui-field"><span>Summary / Notes</span><textarea rows={2} value={form.summary} onInput={(e) => setForm({ ...form, summary: (e.target as HTMLTextAreaElement).value })} /></label>
          <TextField label="External reference (optional)" value={form.reference} onInput={(e) => setForm({ ...form, reference: (e.target as HTMLInputElement).value })} />
          <div class="btn-row">
            <Button variant="primary" type="submit" disabled={!canWrite}>Save log</Button>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      )}
      {rows === null ? <p class="text-muted">Loading communications…</p> : rows.length ? (
        <table class="table">
          <thead><tr><th>When</th><th>Channel</th><th>Direction</th><th>Subject</th><th>Ref</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td class="text-muted">{(r.occurredAt || "").slice(0, 10)}</td>
              <td><Badge tone="neutral">{r.channel}</Badge></td>
              <td>{r.direction}</td>
              <th scope="row"><MessageSquare size={12} style={{ marginRight: "4px" }} />{r.subject}</th>
              <td class="text-muted">{r.reference || "—"}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : <p class="text-muted">No communications logged yet.</p>}
    </div>
  );
}
