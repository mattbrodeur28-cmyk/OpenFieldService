import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { useAccount } from "../auth";
import { useConnectivity } from "../hooks/use-connectivity";
import type { Contact, ContactRole, Site } from "../types";
import { Button } from "./ui/button";
import { TextField } from "./ui/input";
import { Select } from "./ui/select";
import { DialogTitle } from "./ui/dialog";
import { Checkbox, Notice, Sheet, Textarea } from "./ui/surfaces";
const labels: Record<ContactRole, string> = {
  billing: "Billing",
  service: "Service",
  accounts_payable: "Accounts payable",
  site_supervisor: "Site supervisor",
  estimator: "Estimator",
  other: "Other",
};
const roles = Object.keys(labels) as ContactRole[];
const blank = () => ({
  name: "",
  title: "",
  email: "",
  phone: "",
  emailOk: true,
  phoneOk: true,
  smsOk: false,
  notes: "",
  siteId: null as string | null,
  roles: [] as ContactRole[],
});
export function CustomerContacts({ customerId }: { customerId: string }) {
  const { user } = useAccount(),
    { readOnly } = useConnectivity();
  const [contacts, setContacts] = useState<Contact[]>([]),
    [sites, setSites] = useState<Site[]>([]),
    [includeInactive, setIncludeInactive] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [editing, setEditing] = useState<Contact | "new" | null>(null),
    [form, setForm] = useState(blank),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState("");
  const canWrite =
      user.role !== "viewer" && user.active && !user.mustChangePassword,
    disabled = !canWrite || readOnly || busy;
  const changed = () => {
    setRevision((v) => v + 1);
    window.dispatchEvent(
      new CustomEvent("ofs:crm-changed", { detail: { customerId } }),
    );
  };
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    Promise.all([
      api<{ contacts: Contact[] }>(
        "GET",
        `/api/service/customers/${customerId}/contacts?includeInactive=${includeInactive}`,
      ),
      api<{ sites: Site[] }>("GET", `/api/customers/${customerId}/sites`),
    ])
      .then(([c, s]) => {
        if (current) {
          setContacts(c.contacts);
          setSites(s.sites);
        }
      })
      .catch((e) => {
        if (current) setError((e as Error).message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [customerId, includeInactive, revision]);
  function begin(contact: Contact | "new") {
    setForm(
      contact === "new"
        ? blank()
        : {
            name: contact.name,
            title: contact.title,
            email: contact.email,
            phone: contact.phone,
            emailOk: contact.emailOk,
            phoneOk: contact.phoneOk,
            smsOk: contact.smsOk,
            notes: contact.notes,
            siteId: contact.siteId,
            roles: [...contact.roles],
          },
    );
    setEditing(contact);
    setFormError("");
  }
  async function save() {
    if (disabled || !editing) return;
    setBusy(true);
    setFormError("");
    try {
      await api(
        editing === "new" ? "POST" : "PUT",
        `/api/service/customers/${customerId}/contacts${editing === "new" ? "" : "/" + editing.id}`,
        {
          ...form,
          ...(editing === "new" ? {} : { expectedVersion: editing.version }),
        },
      );
      setEditing(null);
      changed();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function state(contact: Contact, action: "archive" | "restore") {
    if (disabled) return;
    setBusy(true);
    setError("");
    try {
      await api(
        "POST",
        `/api/service/customers/${customerId}/contacts/${contact.id}/${action}`,
        { expectedVersion: contact.version },
      );
      changed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section class="detail-section" aria-label="Contacts">
      <div class="equipment-heading">
        <h3>Contacts ({contacts.length})</h3>
        <div class="contact-actions">
          <Checkbox
            label="Show archived"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.currentTarget.checked)}
          />
          {canWrite && (
            <Button
              variant="primary"
              disabled={disabled || loading}
              onClick={() => begin("new")}
            >
              Add contact
            </Button>
          )}
        </div>
      </div>
      <p class="workspace-help">
        Billing contacts, service coordinators and site supervisors share this
        account. Communication preferences are recorded here; no message is
        sent.
      </p>
      {error && (
        <Notice tone="danger">
          {error}
          <Button onClick={() => setRevision((v) => v + 1)} disabled={busy}>
            Reload contacts
          </Button>
        </Notice>
      )}
      {loading ? (
        <p role="status">Loading contacts…</p>
      ) : contacts.length === 0 ? (
        <p class="text-muted">No contacts recorded.</p>
      ) : (
        <div class="equipment-grid">
          {contacts.map((c) => (
            <article
              key={c.id}
              class={
                "card equipment-card" + (c.active ? "" : " contact-archived")
              }
            >
              <strong>{c.name}</strong>
              {c.title && <span class="text-muted">{c.title}</span>}
              <span>{[c.email, c.phone].filter(Boolean).join(" · ")}</span>
              <small>
                {c.siteId
                  ? sites.find((s) => s.id === c.siteId)?.name || "Linked site"
                  : "Account contact"}
              </small>
              <div class="contact-roles">
                {c.roles.map((r) => (
                  <span key={r} class="status-badge">
                    {labels[r]}
                  </span>
                ))}
              </div>
              {canWrite && (
                <div class="contact-actions">
                  {c.active ? (
                    <>
                      <Button disabled={disabled} onClick={() => begin(c)}>
                        Edit
                      </Button>
                      <Button
                        disabled={disabled}
                        onClick={() => void state(c, "archive")}
                      >
                        Archive
                      </Button>
                    </>
                  ) : (
                    <>
                      <span>Archived</span>
                      <Button
                        disabled={disabled}
                        onClick={() => void state(c, "restore")}
                      >
                        Restore
                      </Button>
                    </>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {editing && (
        <Sheet
          close={() => {
            if (!busy) setEditing(null);
          }}
        >
          <DialogTitle>
            {editing === "new" ? "Add contact" : "Edit contact"}
          </DialogTitle>
          {formError && <Notice tone="danger">{formError}</Notice>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <fieldset disabled={disabled} class="crm-contact-fields">
              {(["name", "title", "email", "phone"] as const).map((field) => (
                <TextField
                  key={field}
                  label={
                    {
                      name: "Name",
                      title: "Title",
                      email: "Email",
                      phone: "Phone",
                    }[field]
                  }
                  value={form[field]}
                  required={field === "name"}
                  type={
                    field === "email"
                      ? "email"
                      : field === "phone"
                        ? "tel"
                        : "text"
                  }
                  maxLength={
                    { name: 200, title: 100, email: 254, phone: 60 }[field]
                  }
                  onInput={(e) =>
                    setForm({ ...form, [field]: e.currentTarget.value })
                  }
                />
              ))}
              <Select
                label="Contact scope"
                value={form.siteId || "account"}
                disabled={disabled}
                options={[
                  { value: "account", label: "Whole account" },
                  ...sites.map((s) => ({ value: s.id, label: s.name })),
                ]}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    siteId: value === "account" ? null : value,
                  })
                }
              />
              <fieldset class="contact-preferences">
                <legend>Communication preferences</legend>
                <Checkbox
                  label="Email is usable"
                  checked={form.emailOk}
                  onChange={(e) =>
                    setForm({ ...form, emailOk: e.currentTarget.checked })
                  }
                />
                <Checkbox
                  label="Phone is usable"
                  checked={form.phoneOk}
                  onChange={(e) =>
                    setForm({ ...form, phoneOk: e.currentTarget.checked })
                  }
                />
                <Checkbox
                  label="SMS allowed"
                  checked={form.smsOk}
                  onChange={(e) =>
                    setForm({ ...form, smsOk: e.currentTarget.checked })
                  }
                />
              </fieldset>
              <fieldset class="contact-preferences">
                <legend>Roles</legend>
                {roles.map((r) => (
                  <Checkbox
                    key={r}
                    label={labels[r]}
                    checked={form.roles.includes(r)}
                    onChange={() =>
                      setForm({
                        ...form,
                        roles: form.roles.includes(r)
                          ? form.roles.filter((v) => v !== r)
                          : [...form.roles, r],
                      })
                    }
                  />
                ))}
              </fieldset>
              <label class="ui-field">
                Notes
                <Textarea
                  rows={3}
                  maxLength={2000}
                  value={form.notes}
                  onInput={(e) =>
                    setForm({ ...form, notes: e.currentTarget.value })
                  }
                />
              </label>
            </fieldset>
            <div class="contact-actions">
              <Button type="submit" variant="primary" disabled={disabled}>
                {busy ? "Saving…" : "Save contact"}
              </Button>
              <Button disabled={busy} onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Sheet>
      )}
    </section>
  );
}
