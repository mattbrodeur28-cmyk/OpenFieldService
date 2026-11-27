import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { useApp } from "../context";
import { useAccount, isAdministrator } from "../auth";
import { useConnectivity } from "../hooks/use-connectivity";
import { Button } from "./ui/button";
import { TextField } from "./ui/input";
import { Select } from "./ui/select";
import { Badge, Notice, Table } from "./ui/surfaces";
import { Plus, ShieldCheck } from "lucide-preact";

const uuid = () => crypto.randomUUID();
const money = (cents?: number | null) => cents == null ? "—" : "$" + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AgreementMemberships() {
  const { user } = useAccount();
  const { customers } = useApp();
  const { readOnly } = useConnectivity();
  const canWrite = user.role !== "viewer" && user.active && !user.mustChangePassword && !readOnly;
  const admin = isAdministrator(user) && !readOnly;

  const [plans, setPlans] = useState<any[]>([]);
  const [memberships, setMemberships] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [rev, setRev] = useState(0);

  const [planForm, setPlanForm] = useState({ name: "", billingCycle: "annual", price: "249", visitsPerYear: "2", discountPct: "10" });
  const [enrollForm, setEnrollForm] = useState({
    customerId: "", planId: "",
    startsOn: new Date().toISOString().slice(0, 10),
    renewalDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
    autoRenew: false, authorizedBy: "",
  });

  useEffect(() => {
    let live = true;
    setError("");
    void api<{ plans: any[]; memberships: any[] }>("GET", "/api/residential/overview")
      .then((res) => {
        if (!live) return;
        setPlans(res.plans || []);
        setMemberships(res.memberships || []);
      })
      .catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [rev]);

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

  async function setStatus(id: string, status: string) {
    setError("");
    try {
      await api("POST", `/api/residential/memberships/${id}/status`, { status });
      setRev((r) => r + 1);
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <div class="project-tab-stack">
      {error && <Notice tone="danger">{error}</Notice>}

      {admin && (
        <section class="detail-section">
          <h3>Membership Plans</h3>
          <form class="sales-form" onSubmit={createPlan}>
            <div class="sales-form-grid">
              <TextField label="Plan name" value={planForm.name} onInput={(e) => setPlanForm({ ...planForm, name: (e.target as HTMLInputElement).value })} />
              <Select label="Billing cycle" value={planForm.billingCycle} options={["monthly", "quarterly", "annual"].map((v) => ({ value: v, label: v }))} onValueChange={(billingCycle) => setPlanForm({ ...planForm, billingCycle })} />
              <TextField label="Price ($)" type="number" value={planForm.price} onInput={(e) => setPlanForm({ ...planForm, price: (e.target as HTMLInputElement).value })} />
              <TextField label="Member discount (%)" type="number" value={planForm.discountPct} onInput={(e) => setPlanForm({ ...planForm, discountPct: (e.target as HTMLInputElement).value })} />
            </div>
            <div><Button variant="primary" type="submit"><Plus size={14} /> Add membership plan</Button></div>
          </form>
        </section>
      )}

      {plans.length > 0 && (
        <section class="detail-section">
          <h3>Enroll Customer</h3>
          <form class="sales-form" onSubmit={enroll}>
            <div class="sales-form-grid">
              <Select label="Customer" value={enrollForm.customerId} options={customers.map((c) => ({ value: c.id, label: c.name }))} onValueChange={(customerId) => setEnrollForm({ ...enrollForm, customerId })} />
              <Select label="Plan" value={enrollForm.planId} options={plans.map((p) => ({ value: p.id, label: `${p.name} (${money(p.priceCents)})` }))} onValueChange={(planId) => setEnrollForm({ ...enrollForm, planId })} />
              <TextField label="Start date" type="date" value={enrollForm.startsOn} onInput={(e) => setEnrollForm({ ...enrollForm, startsOn: (e.target as HTMLInputElement).value })} />
              <TextField label="Renewal date" type="date" value={enrollForm.renewalDate} onInput={(e) => setEnrollForm({ ...enrollForm, renewalDate: (e.target as HTMLInputElement).value })} />
            </div>
            <div><Button variant="primary" type="submit" disabled={!canWrite}><ShieldCheck size={14} /> Enroll membership</Button></div>
          </form>
        </section>
      )}

      <section class="detail-section">
        <h3>Residential Memberships</h3>
        {memberships.length ? (
          <Table label="Residential memberships">
            <thead><tr><th>Customer</th><th>Plan</th><th>Price</th><th>Discount</th><th>Renewal</th><th>Status</th><th></th></tr></thead>
            <tbody>{memberships.map((m) => (
              <tr key={m.id}>
                <th scope="row">{m.customerName}</th>
                <td>{m.planName}</td>
                <td>{money(m.priceCents)}</td>
                <td>{(m.discountBps / 100).toFixed(0)}%</td>
                <td>{m.renewalDate}</td>
                <td><Badge tone={m.status === "active" ? "success" : m.status === "cancelled" ? "danger" : "warning"}>{m.status}</Badge></td>
                <td>
                  {canWrite && m.status === "active" && (
                    <Button variant="ghost" onClick={() => void setStatus(m.id, "cancelled")}>Cancel</Button>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </Table>
        ) : <p class="text-muted">No residential memberships enrolled yet.</p>}
      </section>
    </div>
  );
}
