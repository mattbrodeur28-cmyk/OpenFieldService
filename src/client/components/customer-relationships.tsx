import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { useAccount } from "../auth";
import { useConnectivity } from "../hooks/use-connectivity";
import type { AccountSettings, BillingLink, Customer, Site } from "../types";
import { Button } from "./ui/button";
import { TextField } from "./ui/input";
import { Select } from "./ui/select";
import { Checkbox, Notice } from "./ui/surfaces";
export function CustomerRelationships({ customerId }: { customerId: string }) {
  const { user } = useAccount(),
    { readOnly } = useConnectivity();
  const [account, setAccount] = useState<AccountSettings | null>(null),
    [form, setForm] = useState<AccountSettings | null>(null),
    [links, setLinks] = useState<BillingLink[]>([]),
    [sites, setSites] = useState<Site[]>([]),
    [choices, setChoices] = useState<Customer[]>([]),
    [search, setSearch] = useState(""),
    [siteId, setSiteId] = useState("none"),
    [billingId, setBillingId] = useState("none"),
    [poRequired, setPoRequired] = useState(false),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const canWrite =
      user.active && !user.mustChangePassword && user.role !== "viewer",
    disabled = !canWrite || readOnly || busy;
  const load = async () => {
    const [a, b, s] = await Promise.all([
      api<{ account: AccountSettings }>(
        "GET",
        `/api/service/customers/${customerId}/account`,
      ),
      api<{ links: BillingLink[] }>(
        "GET",
        `/api/service/customers/${customerId}/billing-links`,
      ),
      api<{ sites: Site[] }>("GET", `/api/customers/${customerId}/sites`),
    ]);
    setAccount(a.account);
    setForm(a.account);
    setLinks(b.links);
    setSites(s.sites);
  };
  useEffect(() => {
    void load().catch((e) => setError((e as Error).message));
  }, [customerId]);
  useEffect(() => {
    let live = true;
    api<{ customers: Customer[] }>(
      "GET",
      "/api/customers?" +
        new URLSearchParams({ search, limit: "50", page: "1" }),
    )
      .then((r) => {
        if (live) setChoices(r.customers);
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [search]);
  async function mutate(work: () => Promise<unknown>, message: string) {
    if (disabled) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(message);
      window.dispatchEvent(
        new CustomEvent("ofs:crm-changed", { detail: { customerId } }),
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const options = choices
    .filter((c) => c.id !== customerId)
    .map((c) => ({ value: c.id, label: c.name }));
  for (const selected of [form?.parentCustomerId, billingId])
    if (
      selected &&
      selected !== "none" &&
      selected !== customerId &&
      !options.some((o) => o.value === selected)
    )
      options.push({ value: selected, label: "Current linked account" });
  return (
    <section class="detail-section" aria-label="Account relationships">
      <div class="equipment-heading">
        <h3>Account relationships</h3>
        <Button
          disabled={busy}
          onClick={() =>
            void load().catch((e) => setError((e as Error).message))
          }
        >
          Reload relationships
        </Button>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      <p class="workspace-help">
        Classification and parent accounts use this customer record. A billing
        relationship identifies who pays for a site; it does not create an
        invoice.
      </p>
      <TextField
        label="Find a related account"
        type="search"
        value={search}
        onInput={(e) => setSearch(e.currentTarget.value)}
        hint="Search the customer directory; up to 50 matches are shown."
      />
      {form && account && (
        <form
          class="crm-account-form"
          onSubmit={(e) => {
            e.preventDefault();
            void mutate(
              () =>
                api("PUT", `/api/service/customers/${customerId}/account`, {
                  segment: form.segment,
                  accountType: form.accountType,
                  parentCustomerId: form.parentCustomerId,
                  expectedVersion: account.version,
                }),
              "Account classification saved.",
            );
          }}
        >
          <Select
            label="Account segment"
            value={form.segment}
            disabled={disabled}
            options={[
              { value: "commercial", label: "Commercial" },
              { value: "residential", label: "Residential" },
            ]}
            onValueChange={(v) =>
              setForm({ ...form, segment: v as AccountSettings["segment"] })
            }
          />
          <Select
            label="Account type"
            value={form.accountType}
            disabled={disabled}
            options={["customer", "prospect", "vendor", "inactive"].map(
              (value) => ({
                value,
                label: value[0].toUpperCase() + value.slice(1),
              }),
            )}
            onValueChange={(v) =>
              setForm({
                ...form,
                accountType: v as AccountSettings["accountType"],
              })
            }
          />
          <Select
            label="Parent account"
            value={form.parentCustomerId || "none"}
            disabled={disabled}
            options={[
              { value: "none", label: "No parent account" },
              ...options,
            ]}
            onValueChange={(v) =>
              setForm({ ...form, parentCustomerId: v === "none" ? null : v })
            }
          />
          {canWrite && (
            <Button type="submit" disabled={disabled}>
              Save classification
            </Button>
          )}
        </form>
      )}
      <h4>Site billing relationships</h4>
      {links.length === 0 ? (
        <p class="text-muted">No billing relationships recorded.</p>
      ) : (
        <ul class="c360-list">
          {links.map((link) => (
            <li key={link.id}>
              <strong>{link.siteName}</strong> → {link.billingName}
              {link.poRequired ? " · PO required" : ""}
              {link.notes && <p>{link.notes}</p>}
              {canWrite && sites.some((s) => s.id === link.siteId) && (
                <Button
                  disabled={disabled}
                  onClick={() =>
                    void mutate(
                      () =>
                        api(
                          "DELETE",
                          `/api/service/customers/${customerId}/billing-links/${link.id}`,
                        ),
                      "Billing relationship removed; audit history retained.",
                    )
                  }
                >
                  Remove relationship
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite && sites.length > 0 && (
        <form
          class="crm-account-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (siteId === "none" || billingId === "none") return;
            void mutate(
              () =>
                api(
                  "POST",
                  `/api/service/customers/${customerId}/billing-links`,
                  { siteId, billingCustomerId: billingId, poRequired, notes },
                ),
              "Billing relationship added.",
            );
          }}
        >
          <Select
            label="Site to bill"
            value={siteId}
            disabled={disabled}
            options={[
              { value: "none", label: "Choose a site" },
              ...sites.map((s) => ({ value: s.id, label: s.name })),
            ]}
            onValueChange={setSiteId}
          />
          <Select
            label="Billing account"
            value={billingId}
            disabled={disabled}
            options={[
              { value: "none", label: "Choose who pays" },
              { value: customerId, label: "This account" },
              ...options,
            ]}
            onValueChange={setBillingId}
          />
          <Checkbox
            label="Purchase order required"
            checked={poRequired}
            disabled={disabled}
            onChange={(e) => setPoRequired(e.currentTarget.checked)}
          />
          <TextField
            label="Billing relationship notes"
            value={notes}
            maxLength={2000}
            disabled={disabled}
            onInput={(e) => setNotes(e.currentTarget.value)}
          />
          <Button
            type="submit"
            disabled={disabled || siteId === "none" || billingId === "none"}
          >
            Add billing relationship
          </Button>
        </form>
      )}
    </section>
  );
}
