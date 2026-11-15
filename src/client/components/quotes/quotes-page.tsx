import { useEffect, useState } from "preact/hooks";
import { accountRequest, useAccount } from "../../auth";
import { useApp } from "../../context";
import { useConnectivity } from "../../hooks/use-connectivity";
import { salesMoney } from "../../sales-types";
import type { QuoteList } from "../../quote-types";
import { Button } from "../ui/button";
import { Badge, EmptyState, LoadingState, Notice, Table } from "../ui/surfaces";
import { QuoteWorkbench } from "./quote-workbench";
import "./quotes.css";

function QuoteCatalog() {
  const { navigate } = useApp(),
    { readOnly } = useConnectivity();
  const [data, setData] = useState<QuoteList | null>(null),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    void accountRequest<QuoteList>("/api/sales/quotes?page=" + page)
      .then((result) => {
        if (live) setData(result);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [page, revision]);
  return (
    <div class="page quotes-page">
      <header class="quote-header">
        <div>
          <h1>Quotes</h1>
          <p class="workspace-help">
            Internal estimates and retained pricing revisions
          </p>
        </div>
        <div class="quote-actions">
          <Button onClick={() => setRevision(revision + 1)}>Refresh</Button>
          <Button
            variant="primary"
            disabled={readOnly}
            onClick={() => navigate("/sales/quotes/new")}
          >
            New quote
          </Button>
        </div>
      </header>
      <Notice>
        Internal draft workbench. Customer offering, acceptance, and material
        procurement are still planned.
      </Notice>
      {error && <Notice tone="danger">{error}</Notice>}
      {!data && !error && <LoadingState label="Loading quote drafts…" />}
      {data && (
        <>
          {data.quotes.length ? (
            <Table label="Internal quote drafts">
              <thead>
                <tr>
                  <th>Quote</th>
                  <th>Opportunity</th>
                  <th>Valid until</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.quotes.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Button
                        variant="ghost"
                        onClick={() => navigate("/sales/quotes/" + row.id)}
                      >
                        {row.identifier} · {row.title}
                      </Button>
                      <small>Revision {row.version}</small>
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        onClick={() => navigate("/sales/" + row.opportunityId)}
                      >
                        {row.opportunityTitle}
                      </Button>
                    </td>
                    <td>{row.validUntil}</td>
                    <td>{salesMoney(row.totalCents)}</td>
                    <td>
                      <Badge>{row.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="No quote drafts yet">
              Create an estimate from an opportunity to start pricing the work.
            </EmptyState>
          )}
          <div class="quote-list-pages">
            <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous quotes
            </Button>
            <span>
              Page {page} · {data.total} quotes
            </span>
            <Button
              disabled={page * data.pageSize >= data.total}
              onClick={() => setPage(page + 1)}
            >
              Next quotes
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
export default function QuotesPage({ quoteId }: { quoteId?: string | null }) {
  const { user } = useAccount();
  if (user.role === "viewer")
    return (
      <div class="page">
        <h1>Quotes</h1>
        <Notice>Internal pricing requires Sales writer access.</Notice>
      </div>
    );
  return quoteId ? (
    <QuoteWorkbench key={quoteId} quoteId={quoteId} />
  ) : (
    <QuoteCatalog />
  );
}
