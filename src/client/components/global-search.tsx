import { Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Search, X } from "lucide-preact";
import { api } from "../api";
import { useApp } from "../context";

const LABELS: Record<string, string> = {
  customers: "Customers",
  contacts: "Contacts",
  opportunities: "Opportunities",
  jobs: "Jobs",
  agreements: "Agreements",
  equipment: "Equipment",
};

interface Row {
  group: string;
  key: string;
  label: string;
  sub: string;
  to: string;
}

export function GlobalSearch() {
  const { navigate } = useApp();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Record<string, any[]>>({});
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function run(value: string) {
    setQuery(value);
    window.clearTimeout(timer.current);
    if (!value.trim()) {
      setResults({});
      setOpen(false);
      return;
    }
    timer.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api<{ results: Record<string, any[]> }>(
          "GET",
          "/api/search?q=" + encodeURIComponent(value.trim()),
        );
        setResults(data.results || {});
        setOpen(true);
        setActive(-1);
      } catch {
        setResults({});
      } finally {
        setLoading(false);
      }
    }, 180);
  }

  const rows: Row[] = [];
  for (const group of Object.keys(LABELS)) {
    const list = results[group];
    if (!list) continue;
    for (const r of list) {
      let label = r.name ?? r.title ?? r.identifier ?? "";
      let sub = "";
      let to = "/";
      if (group === "customers") {
        label = r.name;
        sub = r.email || r.phone || "";
        to = `/customers/${r.id}`;
      } else if (group === "contacts") {
        label = r.name;
        sub = r.email || r.phone || "";
        to = `/customers/${r.customerId}`;
      } else if (group === "opportunities") {
        label = r.title || r.prospectName || "";
        sub = r.prospectName || "";
        to = `/sales/${r.id}`;
      } else if (group === "jobs") {
        label = r.identifier;
        sub = r.status || "";
        to = `/jobs/${r.id}`;
      } else if (group === "agreements") {
        label = r.title;
        sub = "";
        to = `/agreements/${r.id}`;
      } else if (group === "equipment") {
        label = r.name;
        sub = r.serialNumber || "";
        to = `/assets/${r.id}`;
      }
      rows.push({ group, key: r.id, label, sub, to });
    }
  }

  function go(to: string) {
    setOpen(false);
    setQuery("");
    setResults({});
    navigate(to);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || !rows.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(rows[active >= 0 ? active : 0].to);
    }
  }

  let lastGroup = "";
  const items = rows.map((row, index) => {
    const header = row.group !== lastGroup ? (
      <div class="global-search-group-label">{LABELS[row.group]}</div>
    ) : null;
    lastGroup = row.group;
    return (
      <Fragment key={row.key}>
        {header}
        <button
          class={"global-search-row" + (index === active ? " is-active" : "")}
          role="option"
          aria-selected={index === active}
          onMouseEnter={() => setActive(index)}
          onClick={() => go(row.to)}
        >
          <span class="global-search-row-label">{row.label}</span>
          {row.sub && <span class="global-search-row-sub">{row.sub}</span>}
        </button>
      </Fragment>
    );
  });

  return (
    <div class="global-search" ref={boxRef}>
      <div class="global-search-input">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="global-search-results"
          aria-label="Global search"
          placeholder="Search…"
          value={query}
          onInput={(e) => run((e.target as HTMLInputElement).value)}
          onKeyDown={onKey}
          onFocus={() => query.trim() && setOpen(true)}
        />
        {query && (
          <button
            class="btn-icon"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setResults({});
              setOpen(false);
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {open && (
        <div class="global-search-results" id="global-search-results" role="listbox">
          {loading && <div class="global-search-status">Searching…</div>}
          {!loading && rows.length === 0 && (
            <div class="global-search-status">No results for “{query}”.</div>
          )}
          {!loading && items}
        </div>
      )}
    </div>
  );
}
