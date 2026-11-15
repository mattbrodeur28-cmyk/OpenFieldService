import { useEffect, useState } from "preact/hooks";
import { accountRequest } from "../../auth";
import { TextField } from "../ui/input";
import { Select } from "../ui/select";
import { Button } from "../ui/button";

/** Bounded server search; keep the selected native record visible across pages. */
export function SearchPicker<T extends { id: string }>({
  label,
  endpoint,
  selected,
  format,
  change,
  disabled = false,
  blocked,
}: {
  label: string;
  endpoint: string;
  selected: { id: string; label: string } | null;
  format: (row: T) => string;
  change: (row: T) => void;
  disabled?: boolean;
  blocked?: (row: T) => boolean;
}) {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [rows, setRows] = useState<T[]>([]);
  const [more, setMore] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    let live = true;
    if (disabled) {
      setLoading(false);
      setError("");
      setRows([]);
      setMore(false);
      return;
    }
    setLoading(true);
    setError("");
    setRows([]);
    setMore(false);
    const timer = setTimeout(() => {
      const separator = endpoint.includes("?") ? "&" : "?";
      void accountRequest<{
        rows?: T[];
        profiles?: T[];
        total?: number;
        pageSize?: number;
        hasMore?: boolean;
      }>(
        endpoint +
          separator +
          new URLSearchParams({ search, page: String(page) }),
      )
        .then((data) => {
          if (live) {
            setRows(data.rows ?? data.profiles ?? []);
            setMore(
              data.hasMore ?? page * (data.pageSize ?? 25) < (data.total ?? 0),
            );
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [endpoint, search, page, disabled]);
  const options = rows.map((row) => ({
    value: row.id,
    label: row.id === selected?.id ? selected.label : format(row),
    disabled: blocked?.(row),
  }));
  if (selected && !options.some((option) => option.value === selected.id))
    options.unshift({
      value: selected.id,
      label: selected.label,
      disabled: false,
    });
  return (
    <div class="quote-search-picker">
      <TextField
        label={`Find ${label.toLowerCase()}`}
        type="search"
        value={search}
        disabled={disabled}
        maxLength={200}
        onInput={(e) => {
          setSearch(e.currentTarget.value);
          setPage(1);
        }}
      />
      <Select
        label={label}
        value={selected?.id ?? "none"}
        disabled={disabled || loading || !!error}
        options={[
          {
            value: "none",
            label: loading ? "Loading…" : `Choose ${label.toLowerCase()}`,
            disabled: true,
          },
          ...options,
        ]}
        onValueChange={(id) => {
          const row = rows.find((item) => item.id === id);
          if (row) change(row);
        }}
      />
      {error && (
        <p role="alert" class="quote-field-error">
          {error}
        </p>
      )}
      {!disabled && !loading && !error && !rows.length && (
        <p class="workspace-help">No matching {label.toLowerCase()}.</p>
      )}
      <div class="quote-picker-pages">
        <Button
          disabled={disabled || loading || page === 1}
          onClick={() => setPage(page - 1)}
          aria-label={`Previous ${label.toLowerCase()} results`}
        >
          Previous
        </Button>
        <span>Page {page}</span>
        <Button
          disabled={disabled || loading || !more}
          onClick={() => setPage(page + 1)}
          aria-label={`Next ${label.toLowerCase()} results`}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
