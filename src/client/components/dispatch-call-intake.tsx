import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { useApp } from "../context";
import { Button } from "./ui/button";
import { TextField } from "./ui/input";
import { Select } from "./ui/select";
import { Badge, Notice, Table } from "./ui/surfaces";
import { Dialog, DialogTitle } from "./ui/dialog";
import { PhoneCall, Plus, ChevronDown, CheckCircle2, UserPlus } from "lucide-preact";

const uuid = () => crypto.randomUUID();

export function DispatchCallIntake({
  canWrite,
  onDispatched,
}: {
  canWrite: boolean;
  onDispatched(): void;
}) {
  const { customers, technicians, navigate } = useApp();
  const [extraCustomers, setExtraCustomers] = useState<{ id: string; name: string; customer_type?: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ name: "", customer_type: "residential" as "residential" | "commercial", phone: "", email: "", address: "" });
  const [bookings, setBookings] = useState<any[]>([]);
  const [techByBooking, setTechByBooking] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [rev, setRev] = useState(0);
  const [form, setForm] = useState({
    customerId: "",
    channel: "phone",
    issue: "",
    urgency: "normal",
    preferredDate: new Date().toISOString().slice(0, 10),
    preferredWindow: "morning",
  });

  const allCustomers = [
    ...extraCustomers.filter((ec) => !customers.some((c) => c.id === ec.id)),
    ...customers,
  ];

  useEffect(() => {
    let live = true;
    void api<{ bookings: any[] }>("GET", "/api/residential/overview")
      .then((res) => {
        if (!live) return;
        setBookings(res.bookings || []);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [rev]);

  const activeBookings = bookings.filter((b) => ["new", "escalated"].includes(b.status));

  async function saveNewCustomer() {
    if (!newCust.name.trim()) {
      setError("Enter a customer name.");
      return;
    }
    setError("");
    try {
      const created = await api<{ id: string; name: string; customer_type?: string }>("POST", "/api/customers", {
        name: newCust.name.trim(),
        customer_type: newCust.customer_type,
        phone: newCust.phone.trim(),
        email: newCust.email.trim(),
        address: newCust.address.trim(),
      });
      setExtraCustomers((prev) => [{ id: created.id, name: created.name || newCust.name.trim(), customer_type: created.customer_type || newCust.customer_type }, ...prev]);
      setForm((f) => ({ ...f, customerId: created.id }));
      setNewCust({ name: "", customer_type: "residential", phone: "", email: "", address: "" });
      setCreatingCustomer(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function bookCall(e: Event) {
    e.preventDefault();
    if (!form.customerId || !form.issue.trim()) {
      setError("Choose a customer and describe the issue.");
      return;
    }
    setError("");
    try {
      const created = await api<{ booking?: { id: string } }>("POST", "/api/residential/bookings", {
        requestKey: uuid(),
        customerId: form.customerId,
        siteId: null,
        assetId: null,
        channel: form.channel,
        issue: form.issue.trim(),
        urgency: form.urgency,
        preferredDate: form.preferredDate,
        preferredWindow: form.preferredWindow,
      });
      if (created?.booking?.id) {
        await api("POST", `/api/residential/bookings/${created.booking.id}/dispatch`, {
          requestKey: uuid(),
          technicianId: null,
          scheduledDate: form.preferredDate,
          scheduledTime: form.preferredWindow === "afternoon" ? "13:00" : "09:00",
        });
      }
      setModal(false);
      setForm({ ...form, issue: "" });
      setRev((r) => r + 1);
      onDispatched();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function approveAndDispatch(b: any) {
    setError("");
    const chosenTech = techByBooking[b.id] || technicians[0]?.id || null;
    try {
      await api("POST", `/api/residential/bookings/${b.id}/dispatch`, {
        requestKey: uuid(),
        technicianId: chosenTech,
        scheduledDate: b.preferredDate,
        scheduledTime: b.preferredWindow === "afternoon" ? "13:00" : "09:00",
      });
      setRev((r) => r + 1);
      onDispatched();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section class="record-section st-intake-bar">
      <div class="record-section-heading" style={{ justifyContent: "space-between", padding: "10px 14px" }}>
        <button
          type="button"
          style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "transparent", border: "none", color: "inherit", font: "inherit", cursor: "pointer", padding: 0 }}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown size={16} class={"record-section-chevron" + (open ? "" : " is-closed")} />
          <PhoneCall size={15} />
          <span class="record-section-title">Call Intake &amp; Booking</span>
          <Badge tone={activeBookings.length > 0 ? "warning" : "neutral"}>
            {activeBookings.length} open
          </Badge>
        </button>
        <Button variant="primary" disabled={!canWrite} onClick={() => setModal(true)}>
          <Plus size={14} /> Book service call
        </Button>
      </div>

      {open && (
        <div class="record-section-body">
          {error && <Notice tone="danger">{error}</Notice>}
          {activeBookings.length ? (
            <Table label="Open call bookings">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Channel</th>
                  <th>Urgency</th>
                  <th>Preferred</th>
                  <th>Issue</th>
                  <th>Assign Technician</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {activeBookings.map((b) => (
                  <tr key={b.id}>
                    <th scope="row">{b.customerName}</th>
                    <td>{b.channel}</td>
                    <td>
                      <Badge tone={b.urgency === "emergency" || b.urgency === "urgent" ? "danger" : "neutral"}>
                        {b.urgency}
                      </Badge>
                    </td>
                    <td>{b.preferredDate} ({b.preferredWindow})</td>
                    <td>{b.issue}</td>
                    <td>
                      <Select
                        label=""
                        value={techByBooking[b.id] || technicians[0]?.id || ""}
                        options={[
                          { value: "", label: "Unassigned" },
                          ...technicians.map((t) => ({ value: t.id, label: t.name })),
                        ]}
                        onValueChange={(v) => setTechByBooking((m) => ({ ...m, [b.id]: v }))}
                      />
                    </td>
                    <td>
                      <Button variant="primary" disabled={!canWrite} onClick={() => void approveAndDispatch(b)}>
                        Approve &amp; Dispatch
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p class="text-muted">No open call bookings awaiting dispatch. Click <strong>Book service call</strong> to intake a new service call directly onto the board.</p>
          )}
          {bookings.some((b) => b.jobId) && (
            <details style={{ marginTop: "8px" }}>
              <summary class="workspace-help">Recently dispatched calls ({bookings.filter((b) => b.jobId).length})</summary>
              <div class="btn-row" style={{ marginTop: "6px" }}>
                {bookings.filter((b) => b.jobId).slice(0, 8).map((b) => (
                  <Button key={b.id} variant="ghost" onClick={() => navigate(`/jobs/${b.jobId}`)}>
                    {b.customerName} · {b.preferredDate}
                  </Button>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {modal && (
        <Dialog class="project-form" close={() => { setModal(false); setCreatingCustomer(false); }}>
          <DialogTitle>Book Service Call</DialogTitle>
          <form class="sales-form" onSubmit={bookCall}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
              <div style={{ flex: 1 }}>
                <Select
                  label="Customer"
                  value={form.customerId}
                  options={allCustomers.map((c) => ({
                    value: c.id,
                    label: `${c.name} (${(c as any).customer_type === "commercial" ? "Commercial" : "Residential"})`,
                  }))}
                  onValueChange={(customerId) => setForm({ ...form, customerId })}
                />
              </div>
              <Button variant="ghost" disabled={!canWrite} onClick={() => setCreatingCustomer((v) => !v)}>
                <UserPlus size={14} /> {creatingCustomer ? "Cancel" : "New customer"}
              </Button>
            </div>

            {creatingCustomer && (
              <div class="card" style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div class="sales-form-grid">
                  <TextField label="Customer name" value={newCust.name} onInput={(e) => setNewCust({ ...newCust, name: (e.target as HTMLInputElement).value })} />
                  <Select
                    label="Customer type"
                    value={newCust.customer_type}
                    options={[
                      { value: "residential", label: "Residential" },
                      { value: "commercial", label: "Commercial" },
                    ]}
                    onValueChange={(v) => setNewCust({ ...newCust, customer_type: v as "residential" | "commercial" })}
                  />
                </div>
                <div class="sales-form-grid">
                  <TextField label="Phone" value={newCust.phone} onInput={(e) => setNewCust({ ...newCust, phone: (e.target as HTMLInputElement).value })} />
                  <TextField label="Email" type="email" value={newCust.email} onInput={(e) => setNewCust({ ...newCust, email: (e.target as HTMLInputElement).value })} />
                </div>
                <TextField label="Address" value={newCust.address} onInput={(e) => setNewCust({ ...newCust, address: (e.target as HTMLInputElement).value })} />
                <div>
                  <Button variant="primary" disabled={!newCust.name.trim()} onClick={() => void saveNewCustomer()}>
                    <CheckCircle2 size={14} /> Save &amp; select customer
                  </Button>
                </div>
              </div>
            )}

            <div class="sales-form-grid">
              <Select
                label="Intake channel"
                value={form.channel}
                options={[
                  { value: "phone", label: "Phone" },
                  { value: "online", label: "Online" },
                  { value: "after_hours", label: "After hours" },
                  { value: "ai_assisted", label: "AI assisted" },
                ]}
                onValueChange={(channel) => setForm({ ...form, channel })}
              />
              <Select
                label="Urgency"
                value={form.urgency}
                options={[
                  { value: "normal", label: "Normal" },
                  { value: "high", label: "High" },
                  { value: "urgent", label: "Urgent" },
                  { value: "emergency", label: "Emergency" },
                ]}
                onValueChange={(urgency) => setForm({ ...form, urgency })}
              />
            </div>
            <div class="sales-form-grid">
              <TextField
                label="Preferred date"
                type="date"
                value={form.preferredDate}
                onInput={(e) => setForm({ ...form, preferredDate: (e.target as HTMLInputElement).value })}
              />
              <Select
                label="Preferred window"
                value={form.preferredWindow}
                options={[
                  { value: "morning", label: "Morning (9:00 AM)" },
                  { value: "afternoon", label: "Afternoon (1:00 PM)" },
                  { value: "anytime", label: "Anytime" },
                ]}
                onValueChange={(preferredWindow) => setForm({ ...form, preferredWindow })}
              />
            </div>
            <TextField
              label="Issue description"
              value={form.issue}
              onInput={(e) => setForm({ ...form, issue: (e.target as HTMLInputElement).value })}
            />
            {error && <p class="workspace-error" role="alert">{error}</p>}
            <div class="dialog-actions">
              <Button onClick={() => { setModal(false); setCreatingCustomer(false); }}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={!canWrite}>
                <CheckCircle2 size={14} /> Book call
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
