import { MaterialList } from './material-list';
import { useAccount } from '../auth';
import { useEffect, useState } from "preact/hooks";
import { accountRequest } from "../auth";
import { useApp } from "../context";
import { useConnectivity } from "../hooks/use-connectivity";
import { formatTimestamp } from "../time-format";
import { useCompanyTimeZone } from "../hooks/use-company-timezone";
import { StockOperation, type StockAction } from "./stock-operation";
import {
  units,
  scaledQuantity,
  type StockOptions,
  type StockDetail,
  type StockLocation,
  type CatalogItem,
  type StockItem,
} from "../inventory-types";
import { Button } from "./ui/button";
import { TextField } from "./ui/input";
import { Select } from "./ui/select";
import { DialogTitle } from "./ui/dialog";
import {
  Badge,
  Checkbox,
  EmptyState,
  Notice,
  Sheet,
  Table,
} from "./ui/surfaces";
export function StockInventoryPage({ locationId, locationKind }: { locationId?: string | null; locationKind?: "truck" }) {
  const { readOnly } = useConnectivity(),
    { navigate } = useApp(),
    company = useCompanyTimeZone();
  const [options, setOptions] = useState<StockOptions | null>(null),
    [catalog, setCatalog] = useState<CatalogItem[]>([]),
    [selected, setSelected] = useState(locationId || ""),
    [data, setData] = useState<StockDetail | null>(null),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [operation, setOperation] = useState<{
      kind: StockAction;
      movementId?: string;
    } | null>(null),
    [editing, setEditing] = useState<StockLocation | "new" | null>(null),
    [policy, setPolicy] = useState<StockItem | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([
      accountRequest<StockOptions>("/api/service/inventory"),
      accountRequest<{ materials: CatalogItem[] }>("/api/materials"),
    ])
      .then(([o, c]) => {
        if (live) {
          const filtered = locationKind ? {...o,locations:o.locations.filter(l=>l.kind===locationKind)} : o;
          setOptions(filtered);
          setCatalog(c.materials);
          setSelected((current) =>
            filtered.locations.some((l) => l.id === current)
              ? current
              : filtered.locations[0]?.id || "",
          );
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [revision, locationKind]);
  useEffect(() => {
    let live = true;
    setData(null);
    if (!selected) return;
    setError("");
    void accountRequest<StockDetail>(
      "/api/service/inventory/locations/" + selected + "?page=" + page,
    )
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [selected, page, revision]);
  const saved = () => {
    setOperation(null);
    setEditing(null);
    setPolicy(null);
    setNotice("Inventory change saved.");
    setRevision(revision + 1);
  };
  return (
    <div class="page inventory-page">
      <header class="dispatch-title">
        <div>
          <h1>{locationKind ? "Truck inventory" : "Inventory"}</h1>
        </div>
        <Button onClick={() => setRevision(revision + 1)}>Refresh</Button>
        {options?.canManage && (
          <Button disabled={readOnly} onClick={() => setEditing("new")}>
            Add stock location
          </Button>
        )}
      </header>
      <p class="workspace-help">
        Shared materials, warehouse stock and truck custody. Movements preserve
        quantities and costs; job usage links to the same work order and billing
        sources. Costs use the company-wide weighted average; quantities remain
        per location.
      </p>
      {error && <Notice tone="danger">{error}</Notice>}
      {notice && (
        <Notice tone="success" close={() => setNotice("")}>
          {notice}
        </Notice>
      )}
      {options && options.locations.length === 0 && (
        <EmptyState title="No stock locations available">
          {options.canManage
            ? "Add a warehouse or truck to begin."
            : "Ask an administrator to assign truck custody to your mapped technician account."}
        </EmptyState>
      )}
      {!!options?.locations.length && (
        <div class="inventory-toolbar">
          <Select
            label="Stock location"
            value={selected}
            options={options.locations.map((l) => ({
              value: l.id,
              label: l.name + " · " + l.code + (l.active ? "" : " (inactive)"),
            }))}
            onValueChange={(id) => {
              setSelected(id);
              setPage(1);
            }}
          />
          {data && (
            <>
              <Badge>{data.location.kind}</Badge>
              {options.canManage && (
                <Button
                  disabled={readOnly}
                  onClick={() => setEditing(data.location)}
                >
                  Edit location / custody
                </Button>
              )}
            </>
          )}
        </div>
      )}
      {selected && !data && !error && (
        <p role="status">Loading stock ledger…</p>
      )}
      {data && options && (
        <>
          <div class="inventory-toolbar">
            {options.canManage && (
              <Button
                disabled={readOnly || !data.location.active}
                onClick={() => setOperation({ kind: "receipt" })}
              >
                Receive / opening stock
              </Button>
            )}
            <Button
              disabled={
                readOnly ||
                !data.canIssue ||
                !data.location.active ||
                !data.stock.some((s) => s.quantity_milli > 0)
              }
              onClick={() => setOperation({ kind: "transfer" })}
            >
              Transfer stock
            </Button>
            {options.canManage && (
              <Button
                disabled={
                  readOnly || !data.location.active || !data.stock.length
                }
                onClick={() => setOperation({ kind: "adjustment" })}
              >
                Review count variance
              </Button>
            )}
          </div>
          {!data.stock.length ? (
            <EmptyState title="No stock recorded here">
              Receive stock or transfer it from another location. Existing
              catalog balances require opening-balance review.
            </EmptyState>
          ) : (
            <Table label="Location stock balances">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Available</th>
                  <th>Company average / unit</th>
                  <th>Reorder level</th>
                  <th>Stock status</th>
                  {options.canManage && <th>Policy</th>}
                </tr>
              </thead>
              <tbody>
                {data.stock.map((item) => (
                  <tr key={item.material_id}>
                    <td>{item.name}</td>
                    <td>
                      {units(item.quantity_milli)} {item.unit}
                    </td>
                    <td>
                      {item.company_unit_cost_cents === null
                        ? "—"
                        : new Intl.NumberFormat(undefined, {
                            style: "currency",
                            currency: "USD",
                          }).format(item.company_unit_cost_cents / 100)}
                    </td>
                    <td>
                      {units(item.reorder_milli)} {item.unit}
                    </td>
                    <td>
                      <Badge
                        tone={
                          item.quantity_milli <= item.reorder_milli
                            ? "warning"
                            : "success"
                        }
                      >
                        {item.quantity_milli === 0
                          ? "Out of stock"
                          : item.quantity_milli <= item.reorder_milli
                            ? "Reorder"
                            : "Available"}
                      </Badge>
                    </td>
                    {options.canManage && (
                      <td>
                        <Button
                          disabled={readOnly}
                          onClick={() => setPolicy(item)}
                        >
                          Reorder level
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <section class="sales-details">
            <h2>Movement ledger</h2>
            {data.history.length === 0 ? (
              <p class="workspace-help">No stock movements yet.</p>
            ) : (
              <Table label="Stock movement ledger">
                <thead>
                  <tr>
                    <th>Recorded</th>
                    <th>Movement</th>
                    <th>Quantity change</th>
                    <th>Reason</th>
                    <th>Links / actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((m) => (
                    <tr key={m.id}>
                      <td>
                        {formatTimestamp(
                          m.created_at,
                          company.timeZone || "UTC",
                        )}
                      </td>
                      <td>
                        {m.kind} ·{" "}
                        {catalog.find((c) => c.id === m.material_id)?.name ||
                          "Retained material"}
                      </td>
                      <td>
                        {m.quantity_delta > 0 ? "+" : ""}
                        {units(m.quantity_delta)}
                      </td>
                      <td>{m.reason}</td>
                      <td>
                        {m.job_id && (
                          <Button
                            variant="ghost"
                            onClick={() => navigate("/jobs/" + m.job_id)}
                          >
                            Work order
                          </Button>
                        )}
                        {m.purchase_order_id && (
                          <Button
                            variant="ghost"
                            onClick={() =>
                              navigate("/purchasing/" + m.purchase_order_id)
                            }
                          >
                            {m.purchase_order_number || "Purchase order"}
                          </Button>
                        )}
                        {options.canManage &&
                          !m.purchase_order_id &&
                          !m.reversed_by &&
                          [
                            "opening",
                            "receipt",
                            "transfer",
                            "adjustment",
                          ].includes(m.kind) && (
                            <Button
                              disabled={readOnly}
                              onClick={() =>
                                setOperation({
                                  kind: "reversal",
                                  movementId: m.id,
                                })
                              }
                            >
                              Reverse
                            </Button>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <div class="inventory-toolbar">
              <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous movements
              </Button>
              <span>Page {page}</span>
              <Button
                disabled={!data.hasMoreHistory}
                onClick={() => setPage(page + 1)}
              >
                Next movements
              </Button>
            </div>
          </section>
          {operation && (
            <StockOperation
              key={operation.kind + "-" + (operation.movementId || "")}
              kind={operation.kind}
              movementId={operation.movementId}
              source={data}
              options={options}
              catalog={catalog}
              disabled={readOnly}
              close={() => setOperation(null)}
              saved={saved}
            />
          )}
          {policy && (
            <ReorderForm
              item={policy}
              locationId={selected}
              disabled={readOnly}
              close={() => setPolicy(null)}
              saved={saved}
            />
          )}
        </>
      )}
      {editing && (
        <LocationForm
          location={editing === "new" ? null : editing}
          disabled={readOnly}
          close={() => setEditing(null)}
          saved={saved}
        />
      )}
    </div>
  );
}
function LocationForm({
  location,
  disabled,
  close,
  saved,
}: {
  location: StockLocation | null;
  disabled: boolean;
  close(): void;
  saved(): void;
}) {
  const { technicianLookup } = useApp();
  const [name, setName] = useState(location?.name || ""),
    [code, setCode] = useState(location?.code || ""),
    [kind, setKind] = useState(location?.kind || "warehouse"),
    [technician, setTechnician] = useState(location?.technician_id || "none"),
    [active, setActive] = useState(location ? !!location.active : true),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Sheet close={close}>
      <DialogTitle>
        {location ? "Edit stock location" : "Add stock location"}
      </DialogTitle>
      {error && <Notice tone="danger">{error}</Notice>}
      <form
        class="sales-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || disabled) return;
          setBusy(true);
          try {
            await accountRequest("/api/service/inventory/locations", "POST", {
              id: location?.id,
              expectedVersion: location?.version || 0,
              name,
              code,
              kind,
              technicianId:
                kind === "truck" && technician !== "none" ? technician : null,
              active,
              reason,
            });
            saved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <TextField
          label="Location name"
          required
          maxLength={120}
          disabled={busy || disabled}
          value={name}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <TextField
          label="Location code"
          required
          maxLength={32}
          pattern="[A-Za-z0-9_-]+"
          disabled={busy || disabled}
          value={code}
          onInput={(e) => setCode(e.currentTarget.value)}
        />
        <Select
          label="Location type"
          value={kind}
          disabled={busy || disabled}
          onValueChange={(v) => setKind(v as "warehouse" | "truck")}
          options={[
            { value: "warehouse", label: "Warehouse" },
            { value: "truck", label: "Truck" },
          ]}
        />
        {kind === "truck" && (
          <Select
            label="Technician custody"
            value={technician}
            disabled={busy || disabled}
            onValueChange={setTechnician}
            options={[
              { value: "none", label: "Company custody / unassigned" },
              ...technicianLookup.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
        )}
        <Checkbox
          label="Active location"
          checked={active}
          disabled={busy || disabled}
          onChange={(e) => setActive(e.currentTarget.checked)}
        />
        <TextField
          label="Setup / custody change reason"
          required
          minLength={10}
          maxLength={1000}
          disabled={busy || disabled}
          value={reason}
          onInput={(e) => setReason(e.currentTarget.value)}
        />
        <div class="inventory-toolbar">
          <Button type="submit" variant="primary" disabled={busy || disabled}>
            Save location
          </Button>
          <Button disabled={busy} onClick={close}>
            Cancel
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
function ReorderForm({
  item,
  locationId,
  disabled,
  close,
  saved,
}: {
  item: StockItem;
  locationId: string;
  disabled: boolean;
  close(): void;
  saved(): void;
}) {
  const [value, setValue] = useState(String(item.reorder_milli / 1000)),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Sheet close={close}>
      <DialogTitle>Reorder level · {item.name}</DialogTitle>
      {error && <Notice tone="danger">{error}</Notice>}
      <form
        class="sales-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || disabled) return;
          setBusy(true);
          try {
            await accountRequest("/api/service/inventory/policy", "PUT", {
              locationId,
              materialId: item.material_id,
              expectedVersion: item.version,
              reorderMilli: scaledQuantity(value),
              reason,
            });
            saved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <TextField
          label="Reorder quantity"
          inputMode="decimal"
          required
          disabled={busy || disabled}
          value={value}
          onInput={(e) => setValue(e.currentTarget.value)}
        />
        <TextField
          label="Policy change reason"
          required
          minLength={10}
          maxLength={1000}
          disabled={busy || disabled}
          value={reason}
          onInput={(e) => setReason(e.currentTarget.value)}
        />
        <Button type="submit" variant="primary" disabled={busy || disabled}>
          Save reorder level
        </Button>
        <Button disabled={busy} onClick={close}>
          Cancel
        </Button>
      </form>
    </Sheet>
  );
}

export function InventoryPage({locationId,initialTab}:{locationId?:string|null;initialTab?:string}) {
  const {user}=useAccount();
  const [tab,setTab]=useState(initialTab || (user.role==='viewer'?'catalog':'stock'));
  useEffect(()=>{setTab(initialTab || (user.role==='viewer'?'catalog':'stock'));},[initialTab,locationId,user.role]);
  return <section class="business-section"><header class="business-section-header"><strong>Inventory</strong><nav aria-label="Inventory pages">{user.role!=='viewer'&&<button type="button" class={tab==='stock'?'active':''} onClick={()=>setTab('stock')}>Stock</button>}<button type="button" class={tab==='catalog'?'active':''} onClick={()=>setTab('catalog')}>Material catalog</button></nav></header>{tab==='catalog'?<MaterialList/>:<StockInventoryPage key={locationId||'stock'} locationId={locationId}/>}</section>;
}
