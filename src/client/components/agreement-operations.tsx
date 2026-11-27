import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { accountRequest, useAccount, isAdministrator } from "../auth";
import { useApp } from "../context";
import { useConnectivity } from "../hooks/use-connectivity";
import { Button } from "./ui/button";
import { TextField } from "./ui/input";
import { Badge, Notice, Table } from "./ui/surfaces";
import { RefreshCw, FileEdit, DollarSign } from "lucide-preact";

const uuid = () => crypto.randomUUID();
const money = (cents?: number | null) => cents == null ? "—" : "$" + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AgreementOperations({
  agreementId, currentTitle, startsOn, endsOn,
}: {
  agreementId: string; currentTitle: string; startsOn: string; endsOn: string;
}) {
  const { user } = useAccount();
  const { navigate } = useApp();
  const { readOnly } = useConnectivity();
  const admin = isAdministrator(user) && !readOnly;

  const [profitability, setProfitability] = useState<any>(null);
  const [renewals, setRenewals] = useState<any[]>([]);
  const [amendments, setAmendments] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [rev, setRev] = useState(0);
  const [renewForm, setRenewForm] = useState({ startsOn: endsOn || "", endsOn: "", price: "", reason: "" });
  const [amendForm, setAmendForm] = useState({ title: currentTitle, price: "", reason: "" });

  useEffect(() => {
    let live = true;
    setError("");
    void Promise.all([
      accountRequest<any>(`/api/agreements/${agreementId}/profitability`).catch(() => null),
      accountRequest<{ rows: any[] }>(`/api/agreements/${agreementId}/renewals`).catch(() => ({ rows: [] })),
      accountRequest<{ rows: any[] }>(`/api/agreements/${agreementId}/amendments`).catch(() => ({ rows: [] })),
    ]).then(([prof, ren, am]) => {
      if (!live) return;
      setProfitability(prof);
      setRenewals(ren.rows || []);
      setAmendments(am.rows || []);
    }).catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [agreementId, rev]);

  async function createRenewal(e: Event) {
    e.preventDefault();
    if (!renewForm.startsOn || !renewForm.endsOn || renewForm.reason.trim().length < 10) {
      setError("Enter renewal start/end dates and a reason (10+ characters).");
      return;
    }
    setError("");
    try {
      const res = await api<{ agreement: { id: string } }>("POST", `/api/agreements/${agreementId}/renewal`, {
        id: uuid(), requestKey: uuid(),
        startsOn: renewForm.startsOn, endsOn: renewForm.endsOn,
        priceCents: renewForm.price.trim() === "" ? null : Math.round(parseFloat(renewForm.price) * 100),
        reason: renewForm.reason.trim(),
      });
      setRev((r) => r + 1);
      if (res.agreement?.id) navigate(`/agreements/${res.agreement.id}`);
    } catch (err) { setError((err as Error).message); }
  }

  async function createAmendment(e: Event) {
    e.preventDefault();
    if (!amendForm.title.trim() || amendForm.reason.trim().length < 10) {
      setError("Enter an amendment title and reason (10+ characters).");
      return;
    }
    setError("");
    try {
      const res = await api<{ agreement: { id: string } }>("POST", `/api/agreements/${agreementId}/amendment`, {
        id: uuid(), requestKey: uuid(),
        title: amendForm.title.trim(),
        priceCents: amendForm.price.trim() === "" ? null : Math.round(parseFloat(amendForm.price) * 100),
        reason: amendForm.reason.trim(),
      });
      setRev((r) => r + 1);
      if (res.agreement?.id) navigate(`/agreements/${res.agreement.id}`);
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <div class="project-tab-stack">
      {error && <Notice tone="danger">{error}</Notice>}

      <section class="detail-section">
        <h3><DollarSign size={15} style={{ marginRight: "4px" }} />Agreement Profitability (CONTRACT-008)</h3>
        {profitability ? (
          <div class="project-pl">
            <div><span>Authorized Value</span><strong>{money(profitability.contractValueCents)}</strong></div>
            <div><span>Net Material Cost</span><strong>{money(profitability.materialCostCents)}</strong></div>
            <div><span>Approved Labor Cost</span><strong>{money(profitability.laborCostCents)}</strong></div>
            <div><span>Total Cost</span><strong>{money(profitability.totalCostCents)}</strong></div>
            <div><span>Gross Margin</span><strong>{money(profitability.marginCents)}</strong></div>
          </div>
        ) : <p class="text-muted">Profitability requires an authorized agreement term.</p>}
      </section>

      <section class="detail-section">
        <h3><RefreshCw size={15} style={{ marginRight: "6px" }} />Renewals (CONTRACT-006)</h3>
        {renewals.length > 0 && (
          <Table label="Renewal history">
            <thead><tr><th>Agreement</th><th>Term</th><th>Created</th></tr></thead>
            <tbody>{renewals.map((r) => (
              <tr key={r.id}>
                <th scope="row"><Button variant="ghost" onClick={() => navigate(`/agreements/${r.renewedAgreementId || r.id}`)}>{r.title || r.renewedAgreementId}</Button></th>
                <td>{r.startsOn || startsOn} → {r.endsOn || "—"}</td>
                <td class="text-muted">{r.createdAt}</td>
              </tr>
            ))}</tbody>
          </Table>
        )}
        {admin && (
          <form class="sales-form" onSubmit={createRenewal} style={{ marginTop: "10px" }}>
            <div class="sales-form-grid">
              <TextField label="New term start" type="date" value={renewForm.startsOn} onInput={(e) => setRenewForm({ ...renewForm, startsOn: (e.target as HTMLInputElement).value })} />
              <TextField label="New term end" type="date" value={renewForm.endsOn} onInput={(e) => setRenewForm({ ...renewForm, endsOn: (e.target as HTMLInputElement).value })} />
            </div>
            <div class="sales-form-grid">
              <TextField label="Repriced USD (blank = keep)" type="number" value={renewForm.price} onInput={(e) => setRenewForm({ ...renewForm, price: (e.target as HTMLInputElement).value })} />
              <TextField label="Renewal reason (10+ chars)" value={renewForm.reason} onInput={(e) => setRenewForm({ ...renewForm, reason: (e.target as HTMLInputElement).value })} />
            </div>
            <Button variant="primary" type="submit">Create renewal draft</Button>
          </form>
        )}
      </section>

      <section class="detail-section">
        <h3><FileEdit size={15} style={{ marginRight: "6px" }} />Amendments (CONTRACT-002)</h3>
        {amendments.length > 0 && (
          <Table label="Amendment history">
            <thead><tr><th>Amendment</th><th>Created</th><th>Reason</th></tr></thead>
            <tbody>{amendments.map((a) => (
              <tr key={a.id}>
                <th scope="row"><Button variant="ghost" onClick={() => navigate(`/agreements/${a.amendedAgreementId || a.id}`)}>{a.title || a.amendedAgreementId}</Button></th>
                <td class="text-muted">{a.createdAt}</td>
                <td><Badge tone="neutral">{a.reason || "Amended"}</Badge></td>
              </tr>
            ))}</tbody>
          </Table>
        )}
        {admin && (
          <form class="sales-form" onSubmit={createAmendment} style={{ marginTop: "10px" }}>
            <div class="sales-form-grid">
              <TextField label="Amendment title" value={amendForm.title} onInput={(e) => setAmendForm({ ...amendForm, title: (e.target as HTMLInputElement).value })} />
              <TextField label="Updated USD price (blank = keep)" type="number" value={amendForm.price} onInput={(e) => setAmendForm({ ...amendForm, price: (e.target as HTMLInputElement).value })} />
            </div>
            <TextField label="Amendment reason (10+ chars)" value={amendForm.reason} onInput={(e) => setAmendForm({ ...amendForm, reason: (e.target as HTMLInputElement).value })} />
            <Button variant="primary" type="submit">Create amendment draft</Button>
          </form>
        )}
      </section>
    </div>
  );
}
