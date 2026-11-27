import { CustomRecordFields } from "./custom-record-fields";
import { useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { useApp } from "../context";
import { CustomerSales } from "./customer-sales";
import { CustomerContacts } from "./customer-contacts";
import { CustomerRelationships } from "./customer-relationships";
import { CustomerOverview } from "./customer-overview";
import { CustomerEquipment } from "./customer-equipment";
import { CustomerActivity } from "./customer-activity";
import { CustomerCommunications } from "./customer-communications";
import { StatusBadge } from "./status-badge";
import { ArrowLeft, Trash2, Edit3, Save, X, ChevronDown, Building2, Pencil } from "lucide-preact";

// Salesforce-style collapsible record card.
function RecordSection({
  title,
  count,
  defaultOpen = true,
  component = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  component?: boolean;
  children: ComponentChildren;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section class={"record-section" + (open ? " is-open" : "")}>
      <button type="button" class="record-section-heading" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ChevronDown size={16} class={"record-section-chevron" + (open ? "" : " is-closed")} />
        <span class="record-section-title">{title}</span>
        {count != null && <span class="record-section-count">{count}</span>}
      </button>
      {open && <div class={"record-section-body" + (component ? " is-component" : "")}>{children}</div>}
    </section>
  );
}

export function CustomerDetail() {
  const { selectedCustomer: customer, selectedCustomerJobs: jobs, navigate, updateCustomer, deleteCustomer, setError } = useApp();
  const [editing, setEditing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [form, setForm] = useState({ name: "", customer_type: "residential" as "residential" | "commercial", email: "", phone: "", address: "", city: "", state: "", zip: "", notes: "" });

  if (!customer) return null;

  const isCommercial = customer.customer_type === "commercial";

  const startEdit = () => {
    setForm({
      name: customer.name,
      customer_type: isCommercial ? "commercial" : "residential",
      email: customer.email, phone: customer.phone,
      address: customer.address, city: customer.city, state: customer.state,
      zip: customer.zip, notes: customer.notes,
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    await updateCustomer(customer.id, form);
    setEditing(false);
  };

  const toggleCustomerType = async () => {
    setConverting(true);
    try {
      await updateCustomer(customer.id, {
        customer_type: isCommercial ? "residential" : "commercial",
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setConverting(false);
    }
  };

  const fields: [string, string][] = [
    ["Account Name", customer.name],
    ["Customer Type", isCommercial ? "Commercial" : "Residential"],
    ["Phone", customer.phone],
    ["Email", customer.email],
    ["Billing Address", [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(", ")],
    ["Notes", customer.notes],
  ];

  const serviceHistory = (
    <RecordSection title="Service history" count={jobs.length} defaultOpen={false}>
      {jobs.length === 0 ? (
        <p class="text-muted">No jobs yet</p>
      ) : (
        <div class="table-scroll">
          <table class="table">
            <thead><tr><th>ID</th><th>Date</th><th>Status</th><th>Price</th></tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} class="table-row clickable" onClick={() => navigate(`/jobs/${j.id}`)}>
                  <td><span class="identifier">{j.identifier}</span></td>
                  <td>{j.scheduled_date}</td>
                  <td><StatusBadge status={j.status} /></td>
                  <td class="text-right">${j.price.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </RecordSection>
  );

  return (
    <div class="page">
      <div class="record-header account-record-header">
        <div class="record-header-main">
          <button class="btn btn-back" onClick={() => navigate("/customers")}>
            <ArrowLeft size={16} /> Back
          </button>
          <span class="account-icon" aria-hidden="true"><Building2 size={20} /></span>
          <div>
            <span class="account-eyebrow">Account · {isCommercial ? "Commercial" : "Residential"}</span>
            <h1 class="record-header-title">
              {customer.name}{" "}
              <span class={"badge " + (isCommercial ? "badge-info" : "badge-muted")} style={{ verticalAlign: "middle", fontSize: "12px" }}>
                {isCommercial ? "Commercial" : "Residential"}
              </span>
            </h1>
            <div class="record-header-subtitle">
              {customer.phone && <span>{customer.phone}</span>}
              {customer.email && <span>{customer.email}</span>}
              {[customer.city, customer.state].filter(Boolean).join(", ") && <span>{[customer.city, customer.state].filter(Boolean).join(", ")}</span>}
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
              <button class="btn" disabled={converting} onClick={toggleCustomerType}>
                <Building2 size={14} /> {converting ? "Converting..." : isCommercial ? "Convert to Residential" : "Convert to Commercial"}
              </button>
              <button class="btn" onClick={startEdit}><Edit3 size={14} /> Edit</button>
              <button class="btn btn-danger" onClick={() => deleteCustomer(customer.id).catch((err) => setError(err.message))}><Trash2 size={14} /> Delete</button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div class="card detail-section">
          <div class="form-grid">
            <div class="form-group"><label>Name</label><input type="text" value={form.name} onInput={(e) => setForm({ ...form, name: (e.target as HTMLInputElement).value })} /></div>
            <div class="form-group">
              <label>Customer Type</label>
              <select value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: (e.target as HTMLSelectElement).value as "residential" | "commercial" })}>
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
              </select>
            </div>
            <div class="form-group"><label>Email</label><input type="email" value={form.email} onInput={(e) => setForm({ ...form, email: (e.target as HTMLInputElement).value })} /></div>
            <div class="form-group"><label>Phone</label><input type="tel" value={form.phone} onInput={(e) => setForm({ ...form, phone: (e.target as HTMLInputElement).value })} /></div>
            <div class="form-group full-width"><label>Address</label><input type="text" value={form.address} onInput={(e) => setForm({ ...form, address: (e.target as HTMLInputElement).value })} /></div>
            <div class="form-group"><label>City</label><input type="text" value={form.city} onInput={(e) => setForm({ ...form, city: (e.target as HTMLInputElement).value })} /></div>
            <div class="form-group"><label>State</label><input type="text" value={form.state} onInput={(e) => setForm({ ...form, state: (e.target as HTMLInputElement).value })} /></div>
            <div class="form-group"><label>ZIP</label><input type="text" value={form.zip} onInput={(e) => setForm({ ...form, zip: (e.target as HTMLInputElement).value })} /></div>
            <div class="form-group full-width"><label>Notes</label><textarea rows={3} value={form.notes} onInput={(e) => setForm({ ...form, notes: (e.target as HTMLTextAreaElement).value })} /></div>
          </div>
        </div>
      ) : (
        <div class="account-layout">
          <div class="account-col">
            <RecordSection title="About">
              <div class="account-fields">
                {fields.map(([label, value]) => (
                  <div class="account-field" key={label}>
                    <span class="account-field-label">{label}</span>
                    <span class="account-field-value">{value || "—"}</span>
                    <button class="btn-icon account-field-edit" aria-label={`Edit ${label}`} onClick={startEdit}><Pencil size={12} /></button>
                  </div>
                ))}
              </div>
              <CustomRecordFields key={"fields-" + customer.id} objectKey="crm.customer" recordId={customer.id} />
            </RecordSection>
            <RecordSection title="Contacts" component>
              <CustomerContacts key={"contacts-" + customer.id} customerId={customer.id} />
            </RecordSection>
          </div>

          <div class="account-col">
            <RecordSection title="Account overview" component>
              <CustomerOverview key={"overview-" + customer.id} customerId={customer.id} />
            </RecordSection>
            {serviceHistory}
          </div>

          <div class="account-col">
            <RecordSection title="Opportunities" component>
              <CustomerSales key={"sales-" + customer.id} customerId={customer.id} />
            </RecordSection>
            <RecordSection title="Locations & equipment" component defaultOpen={false}>
              <CustomerEquipment key={customer.id} customerId={customer.id} />
            </RecordSection>
            <RecordSection title="Activity" defaultOpen={false}>
              <CustomerActivity customerId={customer.id} />
            </RecordSection>
            <RecordSection title="Communications" defaultOpen={false}>
              <CustomerCommunications key={"comms-" + customer.id} customerId={customer.id} />
            </RecordSection>
            <RecordSection title="Relationships" component defaultOpen={false}>
              <CustomerRelationships key={"relationships-" + customer.id} customerId={customer.id} />
            </RecordSection>
          </div>
        </div>
      )}
    </div>
  );
}
