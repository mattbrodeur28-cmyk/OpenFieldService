import { useEffect, useState } from "preact/hooks";
import { accountRequest } from "../../auth";
import { Button } from "../ui/button";
import { Notice, Table, Badge, EmptyState } from "../ui/surfaces";

type Entry = { direction: "in" | "out"; id: string; occurredOn: string; reference: string; party: string; amountCents: number; method: string; memo: string };
type Data = { entries: Entry[]; totalInCents: number; totalOutCents: number; netCents: number; total: number; page: number; pageSize: number; kind: string };

const money = (cents: number) => "$" + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function LedgerPage() {
  const [data, setData] = useState<Data | null>(null);
  const [kind, setKind] = useState<"all" | "in" | "out">("all");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let live = true;
    setError(""); setData(null);
    void accountRequest<Data>(`/api/service/ledger?kind=${kind}&page=${page}`)
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [kind, page, revision]);

  return (
    <div class="page ledger-page">
      <header class="finance-heading">
        <div><h1>Ledger</h1><p class="workspace-help">Money in and money out across customer payments and supplier purchases.</p></div>
        <div class="finance-actions"><Button onClick={() => setRevision((v) => v + 1)}>Refresh</Button></div>
      </header>
      {error && <Notice tone="danger">{error}</Notice>}
      {data && (
        <>
          <div class="ledger-summary">
            <div class="ledger-summary-card ledger-in"><span>Money In</span><strong>{money(data.totalInCents)}</strong></div>
            <div class="ledger-summary-card ledger-out"><span>Money Out</span><strong>{money(data.totalOutCents)}</strong></div>
            <div class="ledger-summary-card ledger-net"><span>Net</span><strong>{money(data.netCents)}</strong></div>
          </div>
          <div class="ledger-tabs" role="tablist">
            {(["all", "in", "out"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={kind === k} class={"ledger-tab" + (kind === k ? " is-active" : "")} onClick={() => { setKind(k); setPage(1); }}>
                {k === "all" ? "All" : k === "in" ? "Money In" : "Money Out"}
              </button>
            ))}
          </div>
          {data.entries.length ? (
            <Table label="Ledger entries">
              <thead><tr><th>Date</th><th>Direction</th><th>Reference</th><th>Party</th><th>Method</th><th>Amount</th></tr></thead>
              <tbody>{data.entries.map((e) => (
                <tr key={e.direction + e.id}>
                  <td class="text-muted">{e.occurredOn || "—"}</td>
                  <td><Badge tone={e.direction === "in" ? "success" : "warning"}>{e.direction === "in" ? "In" : "Out"}</Badge></td>
                  <td>{e.reference}</td>
                  <td>{e.party}</td>
                  <td class="text-muted">{e.method}</td>
                  <td class={e.direction === "in" ? "ledger-amount-in" : "ledger-amount-out"}>{e.direction === "in" ? "+" : "−"}{money(e.amountCents)}</td>
                </tr>
              ))}</tbody>
            </Table>
          ) : <EmptyState title="No ledger entries yet">Record an invoice payment or receive a purchase order to see money movements here.</EmptyState>}
          <div class="finance-actions"><Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><span>{data.total} entries · page {page}</span><Button disabled={page * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)}>Next</Button></div>
        </>
      )}
      {!data && !error && <p role="status">Loading ledger…</p>}
    </div>
  );
}
