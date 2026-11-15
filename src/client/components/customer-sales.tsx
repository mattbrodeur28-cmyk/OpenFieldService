import { useEffect, useState } from "preact/hooks";
import { accountRequest } from "../auth";
import { salesMoney } from "../sales-types";
import type { Opportunity } from "../sales-types";
import { Button } from "./ui/button";
import { Notice, Badge } from "./ui/surfaces";
interface Context {
  opportunities: Opportunity[];
  total: number;
  openActivities: number;
  page: number;
  pageSize: number;
}
export function CustomerSales({ customerId }: { customerId: string }) {
  const [data, setData] = useState<Context | null>(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(1);
  useEffect(() => {
    let live = true;
    setError("");
    void accountRequest<Context>(
      "/api/sales/customers/" + customerId + "/context?page=" + page,
    )
      .then((value) => {
        if (live) setData(value);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [customerId, page]);
  return (
    <section class="detail-section">
      <h3>Sales and follow-ups</h3>
      {error && <Notice tone="danger">{error}</Notice>}
      {!data && !error && <p role="status">Loading linked Sales records…</p>}
      {data && (
        <>
          <p class="workspace-help">
            {data.total} opportunities · {data.openActivities} open follow-ups.
            Linked to this customer’s existing record.
          </p>
          {data.opportunities.map((o) => (
            <article class="sales-activity" key={o.id}>
              <a href={"/sales/" + o.id}>{o.title}</a>{" "}
              <Badge>{o.stage_name}</Badge>
              <p>
                {salesMoney(o.expected_value)} forecast ·{" "}
                {o.next_action || "No next action recorded"}
              </p>
            </article>
          ))}
          {data.total > 25 && (
            <div class="sales-sheet-header">
              <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
                Previous opportunities
              </Button>
              <span>Page {page}</span>
              <Button
                disabled={page * 25 >= data.total}
                onClick={() => setPage(page + 1)}
              >
                Next opportunities
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
