import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { useApp } from "../context";
import type { AccountSettings, BillingLink, Contact } from "../types";

// CRM-002: Customer 360 — one read-only summary of everything the company already knows.
// Every number is a live projection; nothing here is a stored copy, so it cannot drift.
interface Job {
  id: string;
  identifier: string;
  status: string;
  scheduledDate: string;
  price: number;
  technicianName: string;
  serviceName: string;
}
interface Equipment {
  id: string;
  name: string;
  serialNumber: string;
  status: string;
  siteName: string;
}
interface Summary {
  account: {
    id: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    since: string;
  };
  classification: AccountSettings;
  counts: {
    contacts: number;
    sites: number;
    equipment: number;
    openJobs: number;
  };
  contacts: Contact[];
  contactsByRole: { billing: Contact[]; service: Contact[] };
  billingLinks: BillingLink[];
  sites: { id: string; name: string; address: string }[];
  equipment: Equipment[];
  recentJobs: Job[];
  invoices: {
    count: number;
    billed: number;
    outstanding: number;
    currency: string;
  } | null;
  sales: {
    openOpportunities: number;
    pipelineValue: number;
    currency: string;
  } | null;
}

const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const dollars = (amount: number) =>
  amount.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function CustomerOverview({ customerId }: { customerId: string }) {
  const { navigate } = useApp();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    api<Summary>("GET", `/api/service/customers/${customerId}/360`)
      .then((value) => current && setData(value))
      .catch((err) => current && setError(err.message))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [customerId, revision]);

  useEffect(() => {
    const refresh = (e: Event) => {
      if ((e as CustomEvent).detail?.customerId === customerId)
        setRevision((n) => n + 1);
    };
    window.addEventListener("ofs:crm-changed", refresh);
    return () => window.removeEventListener("ofs:crm-changed", refresh);
  }, [customerId]);

  if (error)
    return (
      <section class="detail-section" aria-label="Account overview">
        <h3>Account overview</h3>
        <p class="equipment-error" role="alert">
          {error}{" "}
          <button class="btn" onClick={() => setRevision((n) => n + 1)}>
            Retry
          </button>
        </p>
      </section>
    );

  if (loading || !data)
    return (
      <section class="detail-section" aria-label="Account overview">
        <h3>Account overview</h3>
        <p role="status">Loading account summary…</p>
      </section>
    );

  const billingContact = data.contactsByRole.billing[0];
  const serviceContact = data.contactsByRole.service[0];
  const activeEquipment = data.counts.equipment;

  return (
    <section class="detail-section" aria-label="Account overview">
      <div class="equipment-heading">
        <h3>Account overview</h3>
        <span class="text-muted">
          {data.classification.segment === "residential"
            ? "Residential"
            : "Commercial"}{" "}
          · {data.classification.accountType}
        </span>
      </div>

      <div class="c360-tiles">
        <div class="c360-tile">
          <span class="c360-value">{data.counts.sites}</span>
          <span class="c360-label">Sites</span>
        </div>
        <div class="c360-tile">
          <span class="c360-value">{activeEquipment}</span>
          <span class="c360-label">Equipment</span>
        </div>
        <div class="c360-tile">
          <span class="c360-value">{data.counts.openJobs}</span>
          <span class="c360-label">Open jobs</span>
        </div>
        <div class="c360-tile">
          <span class="c360-value">{data.counts.contacts}</span>
          <span class="c360-label">Contacts</span>
        </div>
        {data.invoices && (
          <div class="c360-tile">
            <span class="c360-value">{dollars(data.invoices.outstanding)}</span>
            <span class="c360-label">Outstanding</span>
          </div>
        )}
        {data.sales && (
          <div class="c360-tile">
            <span class="c360-value">{money(data.sales.pipelineValue)}</span>
            <span class="c360-label">
              Open pipeline ({data.sales.openOpportunities})
            </span>
          </div>
        )}
      </div>

      {data.sales === null && (
        <p class="workspace-help">
          Sales overview is unavailable for this workspace.
        </p>
      )}
      {data.invoices === null && (
        <p class="workspace-help">
          Invoice overview is unavailable for this workspace.
        </p>
      )}
      <div class="c360-columns">
        <div>
          <h4>Who to contact</h4>
          <ul class="c360-list">
            <li>
              <strong>Billing: </strong>
              {billingContact
                ? `${billingContact.name}${billingContact.email ? ` · ${billingContact.email}` : ""}`
                : "No billing contact recorded"}
            </li>
            <li>
              <strong>Service: </strong>
              {serviceContact
                ? `${serviceContact.name}${serviceContact.phone ? ` · ${serviceContact.phone}` : ""}`
                : "No service contact recorded"}
            </li>
            {data.billingLinks.map((link) => (
              <li key={link.id}>
                <strong>{link.siteName}: </strong>
                {link.billingName}
                {link.poRequired ? " (PO required)" : ""}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4>Recent work</h4>
          {data.recentJobs.length === 0 ? (
            <p class="text-muted">No jobs recorded yet.</p>
          ) : (
            <ul class="c360-list">
              {data.recentJobs.slice(0, 5).map((job) => (
                <li key={job.id}>
                  <button
                    class="c360-link"
                    onClick={() => navigate(`/jobs/${job.id}`)}
                  >
                    {job.identifier}
                  </button>{" "}
                  <span class="text-muted">
                    {job.scheduledDate} · {job.serviceName || "Service"} ·{" "}
                    {job.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
