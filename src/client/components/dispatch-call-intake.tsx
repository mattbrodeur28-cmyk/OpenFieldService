import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { accountRequest, isAdministrator, useAccount } from "../auth";
import { useApp } from "../context";
import { Button } from "./ui/button";
import { TextField } from "./ui/input";
import { Select } from "./ui/select";
import { Badge, Notice, Table } from "./ui/surfaces";
import { Dialog, DialogTitle } from "./ui/dialog";
import { PhoneCall, Plus, ChevronDown, CheckCircle2, UserPlus, BellRing, KeyRound } from "lucide-preact";

const uuid = () => crypto.randomUUID();

export function DispatchCallIntake({
  canWrite,
  onDispatched,
}: {
  canWrite: boolean;
  onDispatched(): void;
}) {
  const { customers, technicians, navigate } = useApp();
  const { user } = useAccount();
  const isAdmin = isAdministrator(user);
  const [extraCustomers, setExtraCustomers] = useState<{ id: string; name: string; customer_type?: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [mcpModal, setMcpModal] = useState(false);
  const [mcpKeys, setMcpKeys] = useState<any[]>([]);
  const [newKeyLabel, setNewKeyLabel] = useState("Website & Email AI Agent");
  const [createdKey, setCreatedKey] = useState("");
  const [aiAlerts, setAiAlerts] = useState<any[]>([]);
  const [techByAlert, setTechByAlert] = useState<Record<string, string>>({});
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; channel: string }[]>([]);
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
    campaignId: "none",
    referredByName: "",
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
    void accountRequest<{ alerts: any[] }>("/api/mcp-admin/alerts?status=pending_confirmation")
      .then((res) => {
        if (!live) return;
        setAiAlerts(res.alerts || []);
      })
      .catch(() => {});
    void accountRequest<{ campaigns: { id: string; name: string; channel: string }[] }>("/api/sales/campaigns?status=active")
      .then((res) => {
        if (!live) return;
        setCampaigns(res.campaigns || []);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [rev]);

  async function loadMcpKeys() {
    try {
      const res = await accountRequest<{ keys: any[] }>("/api/mcp-admin/keys");
      setMcpKeys(res.keys || []);
    } catch {}
  }

  async function createMcpKey() {
    setError("");
    try {
      const res = await accountRequest<{ apiKey: string }>("/api/mcp-admin/keys", "POST", {
        label: newKeyLabel || "Website & Email AI Agent",
      });
      setCreatedKey(res.apiKey);
      await loadMcpKeys();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function confirmAiAlert(alert: any) {
    setError("");
    try {
      await accountRequest(`/api/mcp-admin/alerts/${alert.id}/confirm`, "POST", {
        technicianId: techByAlert[alert.id] || null,
      });
      setRev((r) => r + 1);
      onDispatched();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function dismissAiAlert(alertId: string) {
    setError("");
    try {
      await accountRequest(`/api/mcp-admin/alerts/${alertId}/dismiss`, "POST");
      setRev((r) => r + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  }

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
        const dispatched = await api<{ jobId?: string }>("POST", `/api/residential/bookings/${created.booking.id}/dispatch`, {
          requestKey: uuid(),
          technicianId: null,
          scheduledDate: form.preferredDate,
          scheduledTime: form.preferredWindow === "afternoon" ? "13:00" : "09:00",
        });
        if (dispatched?.jobId && (form.campaignId !== "none" || form.referredByName.trim())) {
          await accountRequest("/api/sales/attributions", "POST", {
            entityType: "job",
            entityId: dispatched.jobId,
            campaignId: form.campaignId === "none" ? null : form.campaignId,
            referralChannel: form.channel,
            referredByName: form.referredByName.trim(),
          }).catch(() => {});
        }
      }
      setModal(false);
      setForm({ ...form, issue: "", campaignId: "none", referredByName: "" });
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
          {aiAlerts.length > 0 && (
            <Badge tone="danger">
              <BellRing size={11} /> {aiAlerts.length} AI pending confirm
            </Badge>
          )}
        </button>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {isAdmin && (
            <Button variant="ghost" onClick={() => { setMcpModal(true); setCreatedKey(""); void loadMcpKeys(); }}>
              <KeyRound size={14} /> AI / MCP
            </Button>
          )}
          <Button variant="primary" disabled={!canWrite} onClick={() => setModal(true)}>
            <Plus size={14} /> Book service call
          </Button>
        </div>
      </div>

      {(open || aiAlerts.length > 0) && (
        <div class="record-section-body">
          {error && <Notice tone="danger">{error}</Notice>}
          {aiAlerts.length > 0 && (
            <div style={{ marginBottom: "14px" }}>
              <Notice tone="warning">
                <strong>{aiAlerts.length} AI-booked service call{aiAlerts.length === 1 ? "" : "s"} awaiting Manager/Owner confirmation</strong>
              </Notice>
              <Table label="AI bookings pending confirmation">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Customer</th>
                    <th>Source</th>
                    <th>Requested</th>
                    <th>Issue</th>
                    <th>Assign Tech</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {aiAlerts.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <button type="button" class="btn-link" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--primary)", fontWeight: 600 }} onClick={() => navigate(`/jobs/${a.job_id}`)}>
                          {a.job_identifier}
                        </button>
                      </td>
                      <td>
                        <strong>{a.customer_name}</strong>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{a.customer_phone || a.customer_email || ""}</div>
                      </td>
                      <td><Badge tone="info">{a.channel}</Badge></td>
                      <td>{a.preferred_date} ({a.preferred_window})</td>
                      <td>{a.issue}</td>
                      <td>
                        <Select
                          label=""
                          value={techByAlert[a.id] || ""}
                          options={[
                            { value: "", label: "Confirm unassigned" },
                            ...technicians.map((t) => ({ value: t.id, label: t.name })),
                          ]}
                          onValueChange={(v) => setTechByAlert((m) => ({ ...m, [a.id]: v }))}
                        />
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <Button variant="primary" disabled={!canWrite} onClick={() => void confirmAiAlert(a)}>
                            Confirm
                          </Button>
                          <Button variant="ghost" disabled={!canWrite} onClick={() => void dismissAiAlert(a.id)}>
                            Dismiss
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
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
            <div class="sales-form-grid">
              <Select
                label="Ad campaign (how they found us)"
                value={form.campaignId}
                options={[
                  { value: "none", label: "None / organic" },
                  ...campaigns.map((c) => ({ value: c.id, label: `${c.name} (${c.channel.replace(/_/g, " ")})` })),
                ]}
                onValueChange={(campaignId) => setForm({ ...form, campaignId })}
              />
              <TextField
                label="Referred by (optional)"
                value={form.referredByName}
                placeholder="Customer or partner name"
                onInput={(e) => setForm({ ...form, referredByName: (e.target as HTMLInputElement).value })}
              />
            </div>
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

      {mcpModal && (
        <Dialog class="project-form" close={() => setMcpModal(false)}>
          <DialogTitle>Dispatch AI / MCP Server</DialogTitle>
          <p class="workspace-help">
            Connect your website chat AI or email responder to <code>{window.location.origin}/api/mcp</code> (JSON-RPC 2.0 Streamable HTTP) with <code>Authorization: Bearer &lt;API_KEY&gt;</code>. Bookings automatically enter the Work Pipeline and alert the Manager/Owner here and in Team Chat.
          </p>
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", marginBottom: "10px" }}>
            <div style={{ flex: 1 }}>
              <TextField label="New key label" value={newKeyLabel} onInput={(e) => setNewKeyLabel(e.currentTarget.value)} />
            </div>
            <Button variant="primary" onClick={() => void createMcpKey()}>Generate key</Button>
          </div>
          {createdKey && (
            <Notice tone="success">
              <strong>Copy this MCP API key now (shown once):</strong>
              <div style={{ marginTop: "4px", wordBreak: "break-all", fontFamily: "monospace", fontSize: "12px" }}>{createdKey}</div>
            </Notice>
          )}
          {mcpKeys.length > 0 && (
            <Table label="MCP API keys">
              <thead><tr><th>Label</th><th>Prefix</th><th>Last used</th><th>Status</th></tr></thead>
              <tbody>
                {mcpKeys.map((k) => (
                  <tr key={k.id}>
                    <td>{k.label}</td>
                    <td><code>{k.keyPrefix}</code></td>
                    <td>{k.lastUsedAt || "Never"}</td>
                    <td><Badge tone={k.revokedAt ? "neutral" : "success"}>{k.revokedAt ? "Revoked" : "Active"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <div class="dialog-actions">
            <Button onClick={() => setMcpModal(false)}>Close</Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
