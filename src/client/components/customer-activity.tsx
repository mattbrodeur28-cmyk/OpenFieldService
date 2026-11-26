import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { formatTimestamp } from "../time-format";

interface Activity {
  id: string;
  kind: string;
  visibility: string;
  title: string;
  details: string;
  dueAt: string | null;
  status: string;
  outcome: string;
  createdAt: string;
}
interface Communication {
  id: string;
  channel: string;
  direction: string;
  subject: string;
  summary: string;
  occurredAt: string;
  createdAt: string;
}

export function CustomerActivity({ customerId }: { customerId: string }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([
      api<{ activities: Activity[] }>("GET", `/api/service/customers/${customerId}/activities`),
      api<{ communications: Communication[] }>("GET", `/api/service/customers/${customerId}/communications`),
    ])
      .then(([a, c]) => {
        if (!live) return;
        setActivities(a.activities || []);
        setCommunications(c.communications || []);
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [customerId]);

  const items = [
    ...activities.map((a) => ({ kind: "activity" as const, key: "a-" + a.id, at: a.dueAt || a.createdAt, a })),
    ...communications.map((c) => ({ kind: "communication" as const, key: "c-" + c.id, at: c.occurredAt || c.createdAt, c })),
  ].sort((x, y) => String(y.at || "").localeCompare(String(x.at || "")));

  if (loading) return <p role="status">Loading activity…</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!items.length) return <p class="text-muted">No activity or communications yet.</p>;

  return (
    <div class="activity-timeline">
      {items.map((item) =>
        item.kind === "activity" ? (
          <div class="activity-item" key={item.key}>
            <div class="activity-item-title">{item.a.title}</div>
            <div class="activity-item-meta">
              {item.a.kind} · {item.a.status}
              {item.a.dueAt ? " · due " + formatTimestamp(item.a.dueAt) : ""}
              {item.a.visibility === "customer_visible" ? " · customer visible" : ""}
            </div>
            {item.a.details && <p class="activity-item-details">{item.a.details}</p>}
          </div>
        ) : (
          <div class="activity-item" key={item.key}>
            <div class="activity-item-title">{item.c.subject || item.c.channel}</div>
            <div class="activity-item-meta">
              {item.c.channel} · {item.c.direction} · {formatTimestamp(item.c.occurredAt)}
            </div>
            {item.c.summary && <p class="activity-item-details">{item.c.summary}</p>}
          </div>
        ),
      )}
    </div>
  );
}
