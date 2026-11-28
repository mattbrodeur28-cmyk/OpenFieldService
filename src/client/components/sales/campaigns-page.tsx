import { useEffect, useState } from "preact/hooks";
import { Plus, RefreshCw, TrendingUp, X, Megaphone, DollarSign, Users, Target } from "lucide-preact";
import { accountRequest, useAccount } from "../../auth";
import { salesMoney, salesMinor } from "../../sales-types";
import { Button } from "../ui/button";
import { TextField } from "../ui/input";
import { Select } from "../ui/select";
import { DialogTitle } from "../ui/dialog";
import { Badge, EmptyState, LoadingState, Notice, Sheet, Table, Textarea } from "../ui/surfaces";

const CHANNEL_LABELS: Record<string, string> = {
  google_ads: "Google Ads",
  local_service_ads: "Local Service Ads (LSA)",
  meta_ads: "Meta / Facebook Ads",
  website_seo: "Website / SEO",
  direct_mail: "Direct Mail",
  yard_sign: "Yard Sign / Truck Wrap",
  referral: "Customer / Partner Referral",
  other: "Other",
};

const CHANNEL_OPTIONS = Object.entries(CHANNEL_LABELS).map(([value, label]) => ({ value, label }));

interface CampaignMetrics {
  leadsCount: number;
  opportunitiesCount: number;
  wonCount: number;
  bookedJobsCount: number;
  quotesSent: number;
  quotesAccepted: number;
  pipelineValueCents: number;
  wonValueCents: number;
  invoicedRevenueCents: number;
  recognizedRevenueCents: number;
  conversionRatePct: number;
  costPerLeadCents: number | null;
  costPerJobCents: number | null;
  roas: number | null;
  roiPct: number | null;
}

interface Campaign {
  id: string;
  name: string;
  channel: string;
  status: "active" | "paused" | "archived";
  trackingCode: string;
  budgetCents: number;
  spendCents: number;
  startDate: string;
  endDate: string;
  notes: string;
  version: number;
  metrics: CampaignMetrics;
}

interface AnalyticsResponse {
  summary: {
    activeCampaigns: number;
    totalCampaigns: number;
    totalBudgetCents: number;
    totalSpendCents: number;
    totalLeads: number;
    totalBookedJobs: number;
    totalWonCount: number;
    totalPipelineValueCents: number;
    totalRevenueCents: number;
    blendedCplCents: number | null;
    blendedCpaCents: number | null;
    blendedRoas: number | null;
  };
  byChannel: {
    channel: string;
    campaignsCount: number;
    spendCents: number;
    leadsCount: number;
    bookedJobsCount: number;
    wonCount: number;
    revenueCents: number;
  }[];
  referralSources: {
    source: string;
    leadsCount: number;
    wonCount: number;
    revenueCents: number;
  }[];
  campaigns: Campaign[];
}

export function CampaignsPage() {
  const { user } = useAccount();
  const canWrite = user.role !== "viewer";
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editor, setEditor] = useState<Campaign | "new" | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<{
    campaign: Campaign;
    opportunities: any[];
    jobs: any[];
    customers: any[];
  } | null>(null);

  // Editor state
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("google_ads");
  const [status, setStatus] = useState<"active" | "paused" | "archived">("active");
  const [trackingCode, setTrackingCode] = useState("");
  const [budget, setBudget] = useState("0.00");
  const [spend, setSpend] = useState("0.00");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (statusFilter !== "all") qs.set("status", statusFilter);
      if (channelFilter !== "all") qs.set("channel", channelFilter);
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const res = await accountRequest<AnalyticsResponse>("/api/sales/campaigns/analytics?" + qs.toString());
      setData(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [statusFilter, channelFilter, from, to]);

  function openEditor(camp: Campaign | "new") {
    setError("");
    setEditor(camp);
    if (camp === "new") {
      setName("");
      setChannel("google_ads");
      setStatus("active");
      setTrackingCode("");
      setBudget("0.00");
      setSpend("0.00");
      setStartDate(new Date().toISOString().slice(0, 10));
      setEndDate("");
      setNotes("");
    } else {
      setName(camp.name);
      setChannel(camp.channel);
      setStatus(camp.status);
      setTrackingCode(camp.trackingCode);
      setBudget((camp.budgetCents / 100).toFixed(2));
      setSpend((camp.spendCents / 100).toFixed(2));
      setStartDate(camp.startDate);
      setEndDate(camp.endDate);
      setNotes(camp.notes);
    }
  }

  async function saveCampaign(e: Event) {
    e.preventDefault();
    setError("");
    let budgetCents = 0;
    let spendCents = 0;
    try {
      budgetCents = salesMinor(budget || "0");
      spendCents = salesMinor(spend || "0");
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        channel,
        status,
        trackingCode,
        budgetCents,
        spendCents,
        startDate,
        endDate,
        notes,
      };
      if (editor && editor !== "new") {
        payload.expectedVersion = editor.version;
        await accountRequest(`/api/sales/campaigns/${editor.id}`, "PUT", payload);
        setNotice("Campaign updated.");
      } else {
        await accountRequest("/api/sales/campaigns", "POST", payload);
        setNotice("Campaign created.");
      }
      setEditor(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(id: string) {
    try {
      const res = await accountRequest<any>(`/api/sales/campaigns/${id}`);
      setSelectedDetail(res);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const s = data?.summary;

  return (
    <div class="page">
      <div class="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
            <Megaphone size={20} /> Ad Campaigns &amp; Referral Attribution
          </h1>
          <p class="workspace-help" style={{ marginTop: "4px" }}>
            Track marketing spend, see how leads were referred in, and measure booked jobs and ROI directly inside Sales.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Button onClick={() => void load()}><RefreshCw size={14} /> Refresh</Button>
          {canWrite && (
            <Button variant="primary" onClick={() => openEditor("new")}>
              <Plus size={14} /> New campaign
            </Button>
          )}
        </div>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}

      <div class="project-kpis" style={{ marginBottom: "16px" }}>
        <div class="card" style={{ padding: "14px" }}>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
            <DollarSign size={13} /> Ad Spend
          </div>
          <div style={{ fontSize: "22px", fontWeight: 700, marginTop: "4px" }}>
            {s ? salesMoney(s.totalSpendCents) : "—"}
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Budget: {s ? salesMoney(s.totalBudgetCents) : "—"} · {s?.activeCampaigns ?? 0} active
          </div>
        </div>
        <div class="card" style={{ padding: "14px" }}>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
            <Users size={13} /> Attributed Leads &amp; Jobs
          </div>
          <div style={{ fontSize: "22px", fontWeight: 700, marginTop: "4px" }}>
            {s ? `${s.totalLeads} leads / ${s.totalBookedJobs} jobs` : "—"}
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            CPL: {s?.blendedCplCents != null ? salesMoney(s.blendedCplCents) : "—"} · CPJ: {s?.blendedCpaCents != null ? salesMoney(s.blendedCpaCents) : "—"}
          </div>
        </div>
        <div class="card" style={{ padding: "14px" }}>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
            <TrendingUp size={13} /> Attributed Revenue
          </div>
          <div style={{ fontSize: "22px", fontWeight: 700, marginTop: "4px" }}>
            {s ? salesMoney(s.totalRevenueCents) : "—"}
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Open pipeline: {s ? salesMoney(s.totalPipelineValueCents) : "—"}
          </div>
        </div>
        <div class="card" style={{ padding: "14px" }}>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
            <Target size={13} /> Blended ROAS
          </div>
          <div style={{ fontSize: "22px", fontWeight: 700, marginTop: "4px" }}>
            {s?.blendedRoas != null ? `${s.blendedRoas.toFixed(2)}×` : "—"}
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Won opportunities: {s?.totalWonCount ?? 0}
          </div>
        </div>
      </div>

      <div class="card" style={{ padding: "12px 14px", marginBottom: "16px", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
        <Select
          label="Status"
          value={statusFilter}
          onValueChange={setStatusFilter}
          options={[
            { value: "all", label: "All statuses" },
            { value: "active", label: "Active" },
            { value: "paused", label: "Paused" },
            { value: "archived", label: "Archived" },
          ]}
        />
        <Select
          label="Channel"
          value={channelFilter}
          onValueChange={setChannelFilter}
          options={[{ value: "all", label: "All channels" }, ...CHANNEL_OPTIONS]}
        />
        <TextField label="From" type="date" value={from} onInput={(e) => setFrom(e.currentTarget.value)} />
        <TextField label="To" type="date" value={to} onInput={(e) => setTo(e.currentTarget.value)} />
      </div>

      {loading && !data ? (
        <LoadingState label="Loading campaign performance..." />
      ) : !data?.campaigns.length ? (
        <EmptyState
          title="No ad campaigns yet"
          action={canWrite ? <Button variant="primary" onClick={() => openEditor("new")}><Plus size={14} /> New campaign</Button> : undefined}
        >
          Create your first campaign (Google Ads, Local Service Ads, Meta, Yard Signs, or Referral program) to track spend, referral sources, and ROI.
        </EmptyState>
      ) : (
        <div class="card" style={{ marginBottom: "18px" }}>
          <Table label="Ad campaigns">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Spend / Budget</th>
                <th>Leads</th>
                <th>Booked Jobs</th>
                <th>Revenue</th>
                <th>CPL</th>
                <th>ROAS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((c) => (
                <tr key={c.id}>
                  <td>
                    <button
                      type="button"
                      class="btn-link"
                      style={{ fontWeight: 600, background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--primary)" }}
                      onClick={() => void openDetail(c.id)}
                    >
                      {c.name}
                    </button>
                    {c.trackingCode && <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Code: {c.trackingCode}</div>}
                  </td>
                  <td>{CHANNEL_LABELS[c.channel] || c.channel}</td>
                  <td>
                    <Badge tone={c.status === "active" ? "success" : c.status === "paused" ? "warning" : "neutral"}>
                      {c.status}
                    </Badge>
                  </td>
                  <td>
                    <strong>{salesMoney(c.spendCents)}</strong>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>of {salesMoney(c.budgetCents)}</div>
                  </td>
                  <td>{c.metrics.leadsCount}</td>
                  <td>{c.metrics.bookedJobsCount}</td>
                  <td><strong>{salesMoney(c.metrics.recognizedRevenueCents)}</strong></td>
                  <td>{c.metrics.costPerLeadCents != null ? salesMoney(c.metrics.costPerLeadCents) : "—"}</td>
                  <td>
                    {c.metrics.roas != null ? (
                      <Badge tone={c.metrics.roas >= 3 ? "success" : c.metrics.roas >= 1 ? "info" : "warning"}>
                        {c.metrics.roas.toFixed(2)}×
                      </Badge>
                    ) : "—"}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <Button onClick={() => void openDetail(c.id)}>Drill-down</Button>
                      {canWrite && <Button onClick={() => openEditor(c)}>Edit</Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {data && (data.byChannel.length > 0 || data.referralSources.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" }}>
          <div class="card" style={{ padding: "14px" }}>
            <h3 style={{ marginTop: 0, fontSize: "15px" }}>Performance by Channel</h3>
            {data.byChannel.length ? (
              <Table label="Channel breakdown">
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>Spend</th>
                    <th>Leads</th>
                    <th>Jobs</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byChannel.map((ch) => (
                    <tr key={ch.channel}>
                      <td>{CHANNEL_LABELS[ch.channel] || ch.channel}</td>
                      <td>{salesMoney(ch.spendCents)}</td>
                      <td>{ch.leadsCount}</td>
                      <td>{ch.bookedJobsCount}</td>
                      <td><strong>{salesMoney(ch.revenueCents)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : <p class="workspace-help">No campaign channels recorded yet.</p>}
          </div>

          <div class="card" style={{ padding: "14px" }}>
            <h3 style={{ marginTop: 0, fontSize: "15px" }}>Organic &amp; Direct Referral Sources</h3>
            {data.referralSources.length ? (
              <Table label="Referral sources">
                <thead>
                  <tr>
                    <th>Referred via</th>
                    <th>Leads</th>
                    <th>Won</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.referralSources.map((rs) => (
                    <tr key={rs.source}>
                      <td>{rs.source}</td>
                      <td>{rs.leadsCount}</td>
                      <td>{rs.wonCount}</td>
                      <td><strong>{salesMoney(rs.revenueCents)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : <p class="workspace-help">No direct/organic referral sources recorded yet.</p>}
          </div>
        </div>
      )}

      {editor && (
        <Sheet close={() => setEditor(null)}>
          <header class="sales-sheet-header">
            <DialogTitle>{editor === "new" ? "New Ad Campaign" : `Edit ${editor.name}`}</DialogTitle>
            <Button size="icon" aria-label="Close" onClick={() => setEditor(null)}><X size={18} /></Button>
          </header>
          <form class="sales-form" onSubmit={saveCampaign}>
            <TextField label="Campaign name" value={name} onInput={(e) => setName(e.currentTarget.value)} required placeholder="e.g. Summer AC Tune-Up Google Ads" />
            <Select label="Channel" value={channel} onValueChange={setChannel} options={CHANNEL_OPTIONS} />
            <Select
              label="Status"
              value={status}
              onValueChange={(v) => setStatus(v as "active" | "paused" | "archived")}
              options={[
                { value: "active", label: "Active" },
                { value: "paused", label: "Paused" },
                { value: "archived", label: "Archived" },
              ]}
            />
            <TextField label="Tracking phone / promo code / UTM" value={trackingCode} onInput={(e) => setTrackingCode(e.currentTarget.value)} placeholder="e.g. utm_campaign=summer-ac or (860) 555-0199" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <TextField label="Budget (USD)" value={budget} onInput={(e) => setBudget(e.currentTarget.value)} />
              <TextField label="Actual Spend (USD)" value={spend} onInput={(e) => setSpend(e.currentTarget.value)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <TextField label="Start date" type="date" value={startDate} onInput={(e) => setStartDate(e.currentTarget.value)} />
              <TextField label="End date" type="date" value={endDate} onInput={(e) => setEndDate(e.currentTarget.value)} />
            </div>
            <label class="ui-field">
              Notes
              <Textarea aria-label="Notes" value={notes} onInput={(e) => setNotes(e.currentTarget.value)} rows={3} />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
              <Button onClick={() => setEditor(null)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? "Saving..." : editor === "new" ? "Create campaign" : "Save changes"}
              </Button>
            </div>
          </form>
        </Sheet>
      )}

      {selectedDetail && (
        <Sheet close={() => setSelectedDetail(null)}>
          <header class="sales-sheet-header">
            <div>
              <Badge tone="info">{CHANNEL_LABELS[selectedDetail.campaign.channel] || selectedDetail.campaign.channel}</Badge>
              <DialogTitle>{selectedDetail.campaign.name}</DialogTitle>
            </div>
            <Button size="icon" aria-label="Close" onClick={() => setSelectedDetail(null)}><X size={18} /></Button>
          </header>
          <p class="workspace-help">
            Spend: {salesMoney(selectedDetail.campaign.spendCents)} · Leads: {selectedDetail.campaign.metrics.leadsCount} · Booked Jobs: {selectedDetail.campaign.metrics.bookedJobsCount} · Revenue: {salesMoney(selectedDetail.campaign.metrics.recognizedRevenueCents)}
          </p>
          <h4 style={{ marginBottom: "6px" }}>Attributed Opportunities ({selectedDetail.opportunities.length})</h4>
          {selectedDetail.opportunities.length ? (
            <Table label="Attributed opportunities">
              <thead><tr><th>Opportunity</th><th>Stage</th><th>Referred by</th><th>Value</th></tr></thead>
              <tbody>
                {selectedDetail.opportunities.map((o) => (
                  <tr key={o.id}>
                    <td>{o.title}</td>
                    <td>{o.stage_name}</td>
                    <td>{o.referred_by_name || o.source || "—"}</td>
                    <td>{salesMoney(o.expected_value || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <p class="workspace-help">No opportunities linked yet.</p>}

          <h4 style={{ marginTop: "14px", marginBottom: "6px" }}>Attributed Jobs ({selectedDetail.jobs.length})</h4>
          {selectedDetail.jobs.length ? (
            <Table label="Attributed jobs">
              <thead><tr><th>Job</th><th>Customer</th><th>Status</th><th>Referred by</th></tr></thead>
              <tbody>
                {selectedDetail.jobs.map((j) => (
                  <tr key={j.id}>
                    <td>{j.identifier}</td>
                    <td>{j.customer_name || "—"}</td>
                    <td>{j.status}</td>
                    <td>{j.referred_by_name || j.referral_channel || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <p class="workspace-help">No jobs directly attributed yet.</p>}
        </Sheet>
      )}
    </div>
  );
}
