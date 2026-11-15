import { useEffect, useState } from "preact/hooks";
import { accountRequest } from "../../auth";
import { useApp } from "../../context";
import { StockOperation } from "../stock-operation";
import {
  units,
  type StockOptions,
  type StockDetail,
  type StockUsage,
  type CatalogItem,
} from "../../inventory-types";
import { Button } from "../ui/button";
import { Select } from "../ui/select";
import { Badge, Notice } from "../ui/surfaces";
export function JobStock({
  jobId,
  canUse,
  canManage,
  disabled,
  onSaved,
}: {
  jobId: string;
  canUse: boolean;
  canManage: boolean;
  disabled: boolean;
  onSaved(): void;
}) {
  const { refreshJob, navigate } = useApp();
  const [options, setOptions] = useState<StockOptions | null>(null),
    [catalog, setCatalog] = useState<CatalogItem[]>([]),
    [usage, setUsage] = useState<StockUsage[]>([]),
    [location, setLocation] = useState("none"),
    [stock, setStock] = useState<StockDetail | null>(null),
    [operation, setOperation] = useState<"usage" | StockUsage | null>(null),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    setError("");
    void Promise.all([
      accountRequest<StockOptions>("/api/service/inventory"),
      accountRequest<{ usage: StockUsage[] }>(
        "/api/service/jobs/" + jobId + "/inventory",
      ),
      accountRequest<{ materials: CatalogItem[] }>("/api/materials"),
    ])
      .then(([o, u, c]) => {
        if (live) {
          setOptions(o);
          setUsage(u.usage);
          setCatalog(c.materials);
          setLocation((current) =>
            o.locations.some((l) => l.id === current)
              ? current
              : o.locations.find((l) => l.active && l.kind === "truck")?.id ||
                o.locations.find((l) => l.active)?.id ||
                "none",
          );
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [jobId, revision]);
  useEffect(() => {
    let live = true;
    setStock(null);
    if (location === "none") return;
    void accountRequest<StockDetail>(
      "/api/service/inventory/locations/" + location,
    )
      .then((s) => {
        if (live) setStock(s);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [location, revision]);
  function saved() {
    setOperation(null);
    setNotice(
      "Job stock movement saved. Native material usage and billing sources updated.",
    );
    setRevision((n) => n + 1);
    onSaved();
    void refreshJob(jobId).catch(() =>
      setError(
        "Stock movement saved, but the job material display could not refresh. Reload the page.",
      ),
    );
  }
  return (
    <section class="sales-details" aria-label="Job truck stock">
      <header class="sales-sheet-header">
        <h4>Truck materials and returns</h4>
        <Button onClick={() => navigate("/inventory")}>Open Inventory</Button>
      </header>
      {error && <Notice tone="warning">{error}</Notice>}
      {notice && (
        <Notice tone="success" close={() => setNotice("")}>
          {notice}
        </Notice>
      )}
      {options && (
        <>
          <div class="inventory-toolbar">
            <Select
              label="Truck / stock location"
              value={location}
              disabled={disabled || !!operation}
              options={[
                { value: "none", label: "Choose stock location" },
                ...options.locations
                  .filter((l) => l.active)
                  .map((l) => ({
                    value: l.id,
                    label: l.name + " · " + l.code,
                  })),
              ]}
              onValueChange={setLocation}
            />
            <Button
              disabled={
                disabled ||
                !canUse ||
                !stock?.canIssue ||
                !stock.stock.some((s) => s.quantity_milli > 0)
              }
              onClick={() => setOperation("usage")}
            >
              Use stock on this job
            </Button>
          </div>
          {!canUse && (
            <p class="workspace-help">
              Record new usage while the job is in the post-work step. Submitted
              reports require review before changes; completed-job returns
              require an administrator.
            </p>
          )}
          {usage.length === 0 ? (
            <p class="workspace-help">No tracked stock used on this job.</p>
          ) : (
            usage.map((u) => (
              <article class="sales-activity" key={u.job_material_id}>
                <strong>{u.name}</strong>
                <p>
                  {units(u.quantity_milli - u.returned_milli)} {u.unit} used ·{" "}
                  {units(u.returned_milli)} returned
                </p>
                <Badge>Tracked stock movement</Badge>
                <Button
                  disabled={
                    disabled ||
                    (!canUse && !canManage) ||
                    u.returned_milli === u.quantity_milli ||
                    !stock
                  }
                  onClick={() => setOperation(u)}
                >
                  Return unused stock
                </Button>
              </article>
            ))
          )}
        </>
      )}
      {operation && stock && options && (
        <StockOperation
          key={
            typeof operation === "string" ? "usage" : operation.job_material_id
          }
          kind={typeof operation === "string" ? "usage" : "return"}
          source={stock}
          options={options}
          catalog={catalog}
          jobId={jobId}
          usage={typeof operation === "string" ? undefined : operation}
          disabled={disabled}
          close={() => setOperation(null)}
          saved={saved}
        />
      )}
    </section>
  );
}
