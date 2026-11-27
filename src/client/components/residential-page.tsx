import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { useApp } from "../context";
import { useAccount, isAdministrator } from "../auth";
import { useConnectivity } from "../hooks/use-connectivity";
import { Button } from "./ui/button";
import { TextField } from "./ui/input";
import { Select } from "./ui/select";
import { Badge, Notice, Table } from "./ui/surfaces";
import { Plus, PhoneCall, Layers, ShieldCheck, CreditCard } from "lucide-preact";

const uuid = () => crypto.randomUUID();
const money = (cents?: number | null) => cents == null ? "—" : "$" + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ResidentialPage() {
  const { user } = useAccount();
  const { customers, technicians, navigate } = useApp();
  const { readOnly } = useConnectivity();
  const canWrite = user.role !== "viewer" && user.active && !user.mustChangePassword && !readOnly;
  const admin = isAdministrator(user) && !readOnly;

  const [tab, setTab] = useState<"bookings" | "estimates" | "memberships" | "payments">("bookings");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [rev, setRev] = useState(0);

  const [bookingForm, setBookingForm] = useState({ customerId: "", channel: "phone", issue: "", urgency: "normal", preferredDate: new Date().toISOString().slice(0, 10), preferredWindow: "morning" });
  const [planForm, setPlanForm] = useState({ name: "", billingCycle: "annual", price: "249", visitsPerYear: "2", discountPct: "10" });
  const [enrollForm, setEnrollForm] = useState({ customerId: "", planId: "", startsOn: new Date().toISOString().slice(0, 10), renewalDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10), autoRenew: false, authorizedBy: "" });
  const [estForm, setEstForm] = useState({ customerId: "", title: "", goodPrice: "450", betterPrice: "850", bestPrice: "1450" });

  useEffect(() => {
    let live = true;
    setError("");
    void api<any>("GET", "/api/residential/overview")
      .then((res) => { if (live) setData(res); })
      .catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [rev]);

  async function createBooking(e: Event) {
    e.preventDefault();
    if (!bookingForm.customerId || !bookingForm.issue.trim()) return;
    setError("");
    try {
      await api("POST", "/api/residential/bookings", {
        requestKey: uuid(), customerId: bookingForm.customerId, siteId: null, assetId: null,
        channel: bookingForm.channel, issue: bookingForm.issue.trim(), urgency: bookingForm.urgency,
        preferredDate: bookingForm.preferredDate, preferredWindow: bookingForm.preferredWindow,
      });
      setBookingForm({ ...bookingForm, issue: "" });
      setRev((r) => r + 1);
    } catch (err) { setError((err as Error).message); }
  }

  async function dispatchBooking(bookingId: string, technicianId: string | null) {
    setError("");
    try {
      const res = await api<{ jobId: string }>("POST", `/api/residential/bookings/${bookingId}/dispatch`, {
        requestKey: uuid(), technicianId, scheduledTime: "09:00",
      });
      setRev((r) => r + 1);
      if (res.jobId) navigate(`/jobs/${res.jobId}`);
    } catch (err) { setError((err as Error).message); }
  }

  async function createEstimate(e: Event) {
    e.preventDefault();
    if (!estForm.customerId || !estForm.title.trim()) return;
    setError("");
    try {
      await api("POST", "/api/residential/estimates", {
        requestKey: uuid(), customerId: estForm.customerId, siteId: null, assetId: null, jobId: null,
        title: estForm.title.trim(),
        options: {
          good: { label: "Good — Essential Repair", summary: "Standard repair with 1-year parts warranty", items: [{ name: "Standard repair package", quantity: 1, unitPriceCents: Math.round((parseFloat(estForm.goodPrice) || 0) * 100) }], taxCents: 0 },
          better: { label: "Better — Repair + Tune-Up", summary: "Repair, full system cleaning & 2-year warranty", items: [{ name: "Enhanced repair + tune-up", quantity: 1, unitPriceCents: Math.round((parseFloat(estForm.betterPrice) || 0) * 100) }], taxCents: 0 },
          best: { label: "Best — Complete Upgrade", summary: "Premium replacement components + 5-year warranty + membership credit", items: [{ name: "Premium upgrade package", quantity: 1, unitPriceCents: Math.round((parseFloat(estForm.bestPrice) || 0) * 100) }], taxCents: 0 },
        },
      });
      setEstForm({ ...estForm, title: "" });
      setRev((r) => r + 1);
    } catch (err) { setError((err as Error).message); }
  }

  async function acceptEstimate(id: string, chosenTier: "good" | "better" | "best") {
    const acceptedBy = window.prompt(`Customer name accepting the ${chosenTier.toUpperCase()} option:`);
    if (!acceptedBy?.trim()) return;
    setError("");
    try {
      await api("POST", `/api/residential/estimates/${id}/accept`, {
        requestKey: uuid(), chosenTier, acceptedBy: acceptedBy.trim(), createInvoice: true,
      });
      setRev((r) => r + 1);
    } catch (err) { setError((err as Error).message); }
  }

  async function createPlan(e: Event) {
    e.preventDefault();
    if (!planForm.name.trim()) return;
    setError("");
    try {
      await api("POST", "/api/residential/plans", {
        name: planForm.name.trim(), billingCycle: planForm.billingCycle,
        priceCents: Math.round((parseFloat(planForm.price) || 0) * 100),
        visitsPerYear: parseInt(planForm.visitsPerYear, 10) || 2,
        discountBps: Math.round((parseFloat(planForm.discountPct) || 0) * 100),
        benefitsText: "Priority scheduling, seasonal tune-ups & member repair discount", active: true,
      });
      setPlanForm({ ...planForm, name: "" });
      setRev((r) => r + 1);
    } catch (err) { setError((err as Error).message); }
  }

  async function enroll(e: Event) {
    e.preventDefault();
    if (!enrollForm.customerId || !enrollForm.planId) return;
    setError("");
    try {
      await api("POST", "/api/residential/memberships", {
        requestKey: uuid(), customerId: enrollForm.customerId, siteId: null, assetId: null,
        planId: enrollForm.planId, startsOn: enrollForm.startsOn, renewalDate: enrollForm.renewalDate,
        autoRenewAuthorized: enrollForm.autoRenew, authorizedBy: enrollForm.authorizedBy,
      });
      setRev((r) => r + 1);
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Residential Service (M12)</h1>
          <p class="workspace-help">Call booking &amp; adaptive dispatch, Good/Better/Best tablet estimates, memberships, and field payments over shared native records.</p>
        </div>
      </header>

      {error && <Notice tone="danger">{error}</Notice>}

      {data && (
        <div class="project-pl" style={{ marginBottom: "14px" }}>
          <div><span>Active Memberships</span><strong>{data.kpis.activeMemberships}</strong></div>
          <div><span>Open Call Bookings</span><strong>{data.kpis.openBookings}</strong></div>
          <div><span>3-Option Estimates</span><strong>{data.kpis.estimatesTotal} ({data.kpis.estimateConversionPct}% conv.)</strong></div>
          <div><span>Field Collected</span><strong>{money(data.kpis.fieldCollectedCents)}</strong></div>
        </div>
      )}

      <nav class="project-tabs" role="tablist">
        {([
          ["bookings", "Call Booking & Adaptive Dispatch"],
          ["estimates", "Good / Better / Best Estimates"],
          ["memberships", "Memberships"],
          ["payments", "Field Payments & Handoff"],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} class={"project-tab" + (tab === id ? " is-active" : "")} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {tab === "bookings" && data && (
        <div class="project-tab-stack">
          <form class="sales-form" onSubmit={createBooking}>
            <div class="sales-form-grid">
              <Select label="Customer" value={bookingForm.customerId} options={customers.map((c) => ({ value: c.id, label: c.name }))} onValueChange={(customerId) => setBookingForm({ ...bookingForm, customerId })} />
              <Select label="Channel" value={bookingForm.channel} options={["phone", "online", "after_hours", "ai_assisted"].map((v) => ({ value: v, label: v }))} onValueChange={(channel) => setBookingForm({ ...bookingForm, channel })} />
              <Select label="Urgency" value={bookingForm.urgency} options={["normal", "high", "urgent", "emergency"].map((v) => ({ value: v, label: v }))} onValueChange={(urgency) => setBookingForm({ ...bookingForm, urgency })} />
            </div>
            <div class="sales-form-grid">
              <TextField label="Issue description" value={bookingForm.issue} onInput={(e) => setBookingForm({ ...bookingForm, issue: (e.target as HTMLInputElement).value })} />
              <TextField label="Preferred date" type="date" value={bookingForm.preferredDate} onInput={(e) => setBookingForm({ ...bookingForm, preferredDate: (e.target as HTMLInputElement).value })} />
            </div>
            <div><Button variant="primary" type="submit" disabled={!canWrite}><PhoneCall size={14} /> Book service call</Button></div>
          </form>

          <Table label="Call booking queue">
            <thead><tr><th>Customer</th><th>Channel</th><th>Urgency</th><th>Preferred</th><th>Issue</th><th>Status</th><th>Dispatch</th></tr></thead>
            <tbody>{data.bookings.map((b: any) => (
              <tr key={b.id}>
                <th scope="row">{b.customerName}</th>
                <td>{b.channel}</td>
                <td><Badge tone={b.urgency === "emergency" || b.urgency === "urgent" ? "danger" : "neutral"}>{b.urgency}</Badge></td>
                <td>{b.preferredDate} ({b.preferredWindow})</td>
                <td>{b.issue}</td>
                <td><Badge tone={b.status === "dispatched" ? "success" : b.escalated ? "warning" : "neutral"}>{b.status}</Badge></td>
                <td>
                  {b.jobId ? (
                    <Button variant="ghost" onClick={() => navigate(`/jobs/${b.jobId}`)}>Open job</Button>
                  ) : (
                    <Button variant="ghost" disabled={!canWrite} onClick={() => void dispatchBooking(b.id, technicians[0]?.id || null)}>Approve &amp; Dispatch</Button>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </Table>
        </div>
      )}

      {tab === "estimates" && data && (
        <div class="project-tab-stack">
          <form class="sales-form" onSubmit={createEstimate}>
            <div class="sales-form-grid">
              <Select label="Customer" value={estForm.customerId} options={customers.map((c) => ({ value: c.id, label: c.name }))} onValueChange={(customerId) => setEstForm({ ...estForm, customerId })} />
              <TextField label="Estimate title" value={estForm.title} onInput={(e) => setEstForm({ ...estForm, title: (e.target as HTMLInputElement).value })} />
            </div>
            <div class="sales-form-grid">
              <TextField label="Good ($)" type="number" value={estForm.goodPrice} onInput={(e) => setEstForm({ ...estForm, goodPrice: (e.target as HTMLInputElement).value })} />
              <TextField label="Better ($)" type="number" value={estForm.betterPrice} onInput={(e) => setEstForm({ ...estForm, betterPrice: (e.target as HTMLInputElement).value })} />
              <TextField label="Best ($)" type="number" value={estForm.bestPrice} onInput={(e) => setEstForm({ ...estForm, bestPrice: (e.target as HTMLInputElement).value })} />
            </div>
            <div><Button variant="primary" type="submit" disabled={!canWrite}><Layers size={14} /> Present 3-option estimate</Button></div>
          </form>

          <Table label="Residential 3-option estimates">
            <thead><tr><th>Customer</th><th>Title</th><th>Good</th><th>Better</th><th>Best</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{data.estimates.map((e: any) => (
              <tr key={e.id}>
                <th scope="row">{e.customerName}</th>
                <td>{e.title}</td>
                <td>{money(e.options.good.totalCents)}</td>
                <td>{money(e.options.better.totalCents)}</td>
                <td>{money(e.options.best.totalCents)}</td>
                <td><Badge tone={e.status === "converted" ? "success" : "warning"}>{e.chosenTier ? `${e.status} (${e.chosenTier})` : e.status}</Badge></td>
                <td>
                  {e.status === "presented" ? (
                    <div class="btn-row">
                      <Button variant="ghost" disabled={!canWrite} onClick={() => void acceptEstimate(e.id, "good")}>Accept Good</Button>
                      <Button variant="ghost" disabled={!canWrite} onClick={() => void acceptEstimate(e.id, "better")}>Accept Better</Button>
                      <Button variant="ghost" disabled={!canWrite} onClick={() => void acceptEstimate(e.id, "best")}>Accept Best</Button>
                    </div>
                  ) : e.jobId ? <Button variant="ghost" onClick={() => navigate(`/jobs/${e.jobId}`)}>Open job</Button> : "—"}
                </td>
              </tr>
            ))}</tbody>
          </Table>
        </div>
      )}

      {tab === "memberships" && data && (
        <div class="project-tab-stack">
          {admin && (
            <form class="sales-form" onSubmit={createPlan}>
              <div class="sales-form-grid">
                <TextField label="New plan name" value={planForm.name} onInput={(e) => setPlanForm({ ...planForm, name: (e.target as HTMLInputElement).value })} />
                <Select label="Cycle" value={planForm.billingCycle} options={["monthly", "quarterly", "annual"].map((v) => ({ value: v, label: v }))} onValueChange={(billingCycle) => setPlanForm({ ...planForm, billingCycle })} />
                <TextField label="Price ($)" type="number" value={planForm.price} onInput={(e) => setPlanForm({ ...planForm, price: (e.target as HTMLInputElement).value })} />
              </div>
              <div><Button variant="primary" type="submit"><Plus size={14} /> Add membership plan</Button></div>
            </form>
          )}
          {data.plans.length > 0 && (
            <form class="sales-form" onSubmit={enroll}>
              <div class="sales-form-grid">
                <Select label="Enroll customer" value={enrollForm.customerId} options={customers.map((c) => ({ value: c.id, label: c.name }))} onValueChange={(customerId) => setEnrollForm({ ...enrollForm, customerId })} />
                <Select label="Plan" value={enrollForm.planId} options={data.plans.map((p: any) => ({ value: p.id, label: `${p.name} (${money(p.priceCents)})` }))} onValueChange={(planId) => setEnrollForm({ ...enrollForm, planId })} />
                <TextField label="Renewal date" type="date" value={enrollForm.renewalDate} onInput={(e) => setEnrollForm({ ...enrollForm, renewalDate: (e.target as HTMLInputElement).value })} />
              </div>
              <div><Button variant="primary" type="submit" disabled={!canWrite}><ShieldCheck size={14} /> Enroll membership</Button></div>
            </form>
          )}
          <Table label="Active memberships">
            <thead><tr><th>Customer</th><th>Plan</th><th>Price</th><th>Discount</th><th>Renewal</th><th>Status</th></tr></thead>
            <tbody>{data.memberships.map((m: any) => (
              <tr key={m.id}>
                <th scope="row">{m.customerName}</th>
                <td>{m.planName}</td>
                <td>{money(m.priceCents)}</td>
                <td>{(m.discountBps / 100).toFixed(0)}%</td>
                <td>{m.renewalDate}</td>
                <td><Badge tone={m.status === "active" ? "success" : "warning"}>{m.status}</Badge></td>
              </tr>
            ))}</tbody>
          </Table>
        </div>
      )}

      {tab === "payments" && data && (
        <div class="project-tab-stack">
          <Notice tone="info">{data.handoffNote}</Notice>
          <Table label="Field payment intents">
            <thead><tr><th>Invoice</th><th>Customer</th><th>Provider</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>{data.payments.map((p: any) => (
              <tr key={p.id}>
                <th scope="row"><CreditCard size={13} style={{ marginRight: "4px" }} />{p.invoiceIdentifier}</th>
                <td>{p.customerName}</td>
                <td>{p.provider}</td>
                <td>{money(p.amountCents)}</td>
                <td><Badge tone={p.status === "succeeded" ? "success" : p.status === "declined" ? "danger" : "warning"}>{p.status}</Badge></td>
              </tr>
            ))}</tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
