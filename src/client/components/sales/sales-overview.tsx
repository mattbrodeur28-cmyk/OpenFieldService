import { useEffect, useState } from "preact/hooks";
import { accountRequest } from "../../auth";
import { Button } from "../ui/button";
import { Settings2, ChevronLeft, ChevronRight, X } from "lucide-preact";

type Forecast = {
  totals: {
    open: { count: number; value: number; weighted: number };
    won: { count: number; value: number; weighted: number };
    lost: { count: number; value: number; weighted: number };
  };
  stages: { id: string; name: string; kind: string; count: number; value: number; weighted: number }[];
  quoteAcceptance: { offered: number; accepted: number; rate: number | null } | null;
  conversions: number | null;
  currency: string;
};

type Widget = {
  id: string;
  title: string;
  subtitle: string;
  compute: (f: Forecast) => string;
};

const money = (cents: number) =>
  "$" + (cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 });
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + "%" : "—");

const WIDGETS: Widget[] = [
  { id: "total", title: "Total Opportunities", subtitle: "Open pipeline", compute: (f) => String(f.totals.open.count) },
  { id: "pipeline", title: "Pipeline Value", subtitle: "Open expected value", compute: (f) => money(f.totals.open.value) },
  { id: "weighted", title: "Weighted Forecast", subtitle: "Value × probability", compute: (f) => money(f.totals.open.weighted) },
  { id: "won", title: "Won Value", subtitle: "Closed won", compute: (f) => money(f.totals.won.value) },
  { id: "winrate", title: "Win Rate", subtitle: "Won ÷ closed", compute: (f) => pct(f.totals.won.count, f.totals.won.count + f.totals.lost.count) },
  { id: "avgdeal", title: "Avg Deal Size", subtitle: "Pipeline ÷ opportunities", compute: (f) => money(f.totals.open.count ? Math.round(f.totals.open.value / f.totals.open.count) : 0) },
  { id: "quoteaccept", title: "Quote Acceptance", subtitle: "Accepted ÷ offered", compute: (f) => (f.quoteAcceptance ? pct(f.quoteAcceptance.accepted, f.quoteAcceptance.offered) : "—") },
  { id: "conversions", title: "Conversions", subtitle: "Accepted → job", compute: (f) => (f.conversions == null ? "—" : String(f.conversions)) },
  { id: "stagebreak", title: "Stage Breakdown", subtitle: "Open opportunities by stage", compute: (f) => f.stages.filter((s) => s.kind === "open").map((s) => `${s.name}: ${s.count}`).join(" · ") || "—" },
];

const KEY = "ofs-sales-widgets";

function loadOrder(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "");
    if (Array.isArray(raw) && raw.every((v) => typeof v === "string")) return raw;
  } catch {
    /* fall through */
  }
  return WIDGETS.map((w) => w.id);
}

export function SalesOverview() {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [visible, setVisible] = useState<string[]>(loadOrder);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let live = true;
    accountRequest<Forecast>("/api/sales/forecast")
      .then((f) => { if (live) setForecast(f); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const persist = (next: string[]) => {
    setVisible(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const toggle = (id: string) =>
    persist(visible.includes(id) ? visible.filter((v) => v !== id) : [...visible, id]);
  const move = (index: number, dir: -1 | 1) => {
    const next = [...visible];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    persist(next);
  };

  const cards = visible.map((id) => WIDGETS.find((w) => w.id === id)).filter((w): w is Widget => !!w);

  return (
    <section class="sales-overview" aria-label="Sales overview">
      <div class="sales-overview-head">
        <div>
          <span class="dispatch-eyebrow">Overview</span>
          <h2>Sales KPIs</h2>
        </div>
        <Button variant="ghost" onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
          <Settings2 size={14} /> {editing ? "Done" : "Customize"}
        </Button>
      </div>
      {editing && (
        <div class="sales-overview-editor" role="group" aria-label="Choose which KPIs to show">
          <span class="sales-overview-hint">Toggle a KPI to show or hide it, then use the arrows on each card to reorder.</span>
          {WIDGETS.map((w) => (
            <label class="sales-overview-toggle" key={w.id}>
              <input type="checkbox" checked={visible.includes(w.id)} onChange={() => toggle(w.id)} />
              <span>{w.title}</span>
            </label>
          ))}
        </div>
      )}
      <div class="sales-overview-grid">
        {cards.map((w, i) => (
          <article class={"sales-kpi" + (editing ? " is-editing" : "")} key={w.id}>
            {editing && (
              <div class="sales-kpi-controls">
                <button class="btn-icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${w.title} left`}>
                  <ChevronLeft size={14} />
                </button>
                <button class="btn-icon" disabled={i === cards.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${w.title} right`}>
                  <ChevronRight size={14} />
                </button>
                <button class="btn-icon danger" onClick={() => toggle(w.id)} aria-label={`Remove ${w.title}`}>
                  <X size={14} />
                </button>
              </div>
            )}
            <strong class="sales-kpi-value">{forecast ? w.compute(forecast) : "…"}</strong>
            <span class="sales-kpi-title">{w.title}</span>
            <span class="sales-kpi-sub">{w.subtitle}</span>
          </article>
        ))}
        {!cards.length && (
          <p class="sales-overview-empty">All KPIs are hidden. Choose Customize to add some back.</p>
        )}
      </div>
    </section>
  );
}
