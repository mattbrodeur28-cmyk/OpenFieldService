import { TicketDocuments } from "./ticket-documents";
import { useEffect, useState } from "preact/hooks";
import { accountRequest, isAdministrator, useAccount } from "../auth";
import { useApp } from "../context";
import { useConnectivity } from "../hooks/use-connectivity";
import { useCompanyTimeZone } from "../hooks/use-company-timezone";
import { formatTimestamp } from "../time-format";
import { scaledQuantity, units, type StockDetail } from "../inventory-types";
import {
  purchaseMoney as money,
  type Supplier,
  type PurchaseOptions,
  type PurchaseOrder,
  type PurchaseDetail,
  type PurchaseLine,
} from "../purchasing-types";
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
interface Result {
  id: string;
  receiptId?: string;
  replayed?: boolean;
}
interface FormProps {
  disabled: boolean;
  close(): void;
  saved(result: Result): void;
}
// Keep a failed attempt's exact body/key so a lost response cannot duplicate work.
function usePurchaseCommand(
  path: string,
  saved: (result: Result) => void,
  disabled: boolean,
) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState<unknown | null>(null),
    [key] = useState(() => crypto.randomUUID());
  return {
    busy,
    error,
    attempt,
    locked: disabled || busy || attempt !== null,
    async send(build: () => object) {
      if (disabled || busy) return;
      setBusy(true);
      setError("");
      try {
        const body = attempt || { ...build(), requestKey: key };
        setAttempt(body);
        const result = await accountRequest<Result>(path, "POST", body);
        saved(result);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
  };
}
function AttemptNotice({ attempt }: { attempt: unknown }) {
  return attempt ? (
    <Notice>
      Retry keeps the original request. If the result is uncertain, close and
      refresh the order before starting a new operation.
    </Notice>
  ) : null;
}
const statusOptions = [
  "all",
  "draft",
  "approved",
  "issued",
  "partially_received",
  "received",
  "closed",
  "cancelled",
].map((value) => ({
  value,
  label: value === "all" ? "All statuses" : value.replaceAll("_", " "),
}));
export function PurchasingPage({ orderId }: { orderId?: string | null }) {
  const { user } = useAccount(),
    { navigate } = useApp(),
    { readOnly } = useConnectivity(),
    company = useCompanyTimeZone();
  const [options, setOptions] = useState<PurchaseOptions | null>(null),
    [orders, setOrders] = useState<PurchaseOrder[]>([]),
    [detail, setDetail] = useState<PurchaseDetail | null>(null);
  const [selected, setSelected] = useState(orderId || ""),
    [page, setPage] = useState(1),
    [more, setMore] = useState(false),
    [status, setStatus] = useState("all"),
    [search, setSearch] = useState("");
  const [receiptPage, setReceiptPage] = useState(1),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [directory, setDirectory] = useState(false),
    [supplier, setSupplier] = useState<Supplier | "new" | null>(null),
    [editing, setEditing] = useState<PurchaseDetail | "new" | null>(null),
    [action, setAction] = useState(""),
    [receiving, setReceiving] = useState(false),
    [receiptDocument, setReceiptDocument] = useState<string | null>(null);
  useEffect(() => {
    setSelected(orderId || "");
    setReceiptPage(1);
  }, [orderId]);
  useEffect(() => {
    let live = true;
    void accountRequest<PurchaseOptions>("/api/service/purchasing/options")
      .then((o) => {
        if (live) setOptions(o);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [revision]);
  useEffect(() => {
    let live = true;
    setError("");
    void accountRequest<{ orders: PurchaseOrder[]; hasMore: boolean }>(
      "/api/service/purchasing/orders?page=" +
        page +
        "&status=" +
        status +
        "&search=" +
        encodeURIComponent(search),
    )
      .then((d) => {
        if (live) {
          setOrders(d.orders);
          setMore(d.hasMore);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [page, status, search, revision]);
  useEffect(() => {
    let live = true;
    setDetail(null);
    if (selected)
      void accountRequest<PurchaseDetail>(
        "/api/service/purchasing/orders/" + selected + "?page=" + receiptPage,
      )
        .then((d) => {
          if (live) setDetail(d);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [selected, receiptPage, revision]);
  function saved(result: Result, isOrder = false) {
    setSupplier(null);
    setEditing(null);
    setAction("");
    setReceiving(false);
    setNotice("Purchasing change saved.");
    setRevision((n) => n + 1);
    if (isOrder) {
      setSelected(result.id);
      navigate("/purchasing/" + result.id);
    }
  }
  if (!isAdministrator(user))
    return (
      <div class="page">
        <Notice tone="danger">
          Owner or administrator access is required for Purchasing.
        </Notice>
      </div>
    );
  return (
    <div class="page purchasing-page">
      <header class="dispatch-title">
        <h1>Purchasing</h1>
        <div class="inventory-toolbar">
          <Button onClick={() => setRevision((n) => n + 1)}>Refresh</Button>
          <Button onClick={() => setDirectory(true)}>Suppliers</Button>
          <Button
            variant="primary"
            disabled={readOnly || !options}
            onClick={() => setEditing("new")}
          >
            New purchase order
          </Button>
        </div>
      </header>
      <p class="workspace-help">
        Review commitments, receive material and retain actual cost. Accepted
        goods update the same warehouse and vehicle stock ledger.
      </p>
      {error && <Notice tone="danger">{error}</Notice>}
      {notice && (
        <Notice tone="success" close={() => setNotice("")}>
          {notice}
        </Notice>
      )}
      <div class="inventory-toolbar">
        <TextField
          label="Find purchase orders"
          value={search}
          maxLength={120}
          placeholder="PO number or supplier"
          onInput={(e) => {
            setSearch(e.currentTarget.value);
            setPage(1);
          }}
        />
        <Select
          label="Purchase status"
          value={status}
          options={statusOptions}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
      </div>
      {!orders.length ? (
        <EmptyState title="No purchase orders found">
          Add a supplier, then create a purchase order for existing materials
          and a ship-to stock location.
        </EmptyState>
      ) : (
        <Table label="Purchase orders">
          <thead>
            <tr>
              <th>Order</th>
              <th>Supplier</th>
              <th>Ship to</th>
              <th>Expected</th>
              <th>Order total</th>
              <th>Status</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((po) => (
              <tr key={po.id}>
                <td>
                  <strong>{po.number}</strong>
                </td>
                <td>{po.supplier_name}</td>
                <td>{po.location_name}</td>
                <td>{po.expected_date || "Not set"}</td>
                <td>{money(po.totalCents || 0)}</td>
                <td>
                  <Badge>{po.status.replaceAll("_", " ")}</Badge>
                </td>
                <td>
                  <Button
                    onClick={() => {
                      setSelected(po.id);
                      setReceiptPage(1);
                      navigate("/purchasing/" + po.id);
                    }}
                  >
                    Open {po.number}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <div class="inventory-toolbar">
        <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous orders
        </Button>
        <span>Page {page}</span>
        <Button disabled={!more} onClick={() => setPage(page + 1)}>
          Next orders
        </Button>
      </div>
      {detail && (
        <section class="sales-details">
          <header class="dispatch-title">
            <div>
              <h2>{detail.order.number}</h2>
              <p class="workspace-help">
                {detail.issued?.snapshot.supplier.name || detail.supplier.name}{" "}
                ·{" "}
                {detail.issued?.snapshot.destination.name ||
                  detail.destination.name}{" "}
                · {detail.order.status.replaceAll("_", " ")}
              </p>
            </div>
            <div class="inventory-toolbar">
              {detail.order.status === "draft" && (
                <>
                  <Button
                    disabled={readOnly}
                    onClick={() => setEditing(detail)}
                  >
                    Edit draft
                  </Button>
                  <Button
                    disabled={readOnly}
                    onClick={() => setAction("approve")}
                  >
                    Review &amp; approve
                  </Button>
                </>
              )}
              {detail.order.status === "approved" && (
                <>
                  <Button
                    disabled={readOnly}
                    onClick={() => setAction("issue")}
                  >
                    Issue order
                  </Button>
                  <Button
                    disabled={readOnly}
                    onClick={() => setAction("return_to_draft")}
                  >
                    Return to draft
                  </Button>
                </>
              )}
              {["issued", "partially_received", "received"].includes(
                detail.order.status,
              ) && (
                <>
                  <Button
                    variant="primary"
                    disabled={readOnly}
                    onClick={() => setReceiving(true)}
                  >
                    Receive delivery
                  </Button>
                  <Button
                    disabled={readOnly}
                    onClick={() => setAction("close")}
                  >
                    Close outstanding commitments
                  </Button>
                </>
              )}
              {["draft", "approved", "issued"].includes(
                detail.order.status,
              ) && (
                <Button disabled={readOnly} onClick={() => setAction("cancel")}>
                  Cancel order
                </Button>
              )}
              <Button
                onClick={() =>
                  navigate("/inventory/" + detail.order.location_id)
                }
              >
                Ship-to inventory
              </Button>
            </div>
          </header>
          <div class="inventory-toolbar">
            <Badge>Order total {money(detail.totals.totalCents)}</Badge>
            <Badge>
              Open materials {money(detail.totals.openMaterialCents)}
            </Badge>
            <Badge>
              Accepted material cost{" "}
              {money(detail.totals.acceptedMaterialCents)}
            </Badge>
            <span class="workspace-help">
              Materials {money(detail.totals.subtotalCents)} · tax{" "}
              {money(detail.totals.taxCents)} · freight{" "}
              {money(detail.totals.freightCents)}
            </span>
            {detail.issued && (
              <Badge>Issued revision {detail.issued.revision}</Badge>
            )}
          </div>
          <p class="workspace-help">
            {detail.order.terms || "No terms recorded"}
            {detail.order.notes && " · " + detail.order.notes}
          </p>
          <Table label="Purchase order lines">
            <thead>
              <tr>
                <th>Material</th>
                <th>Ordered</th>
                <th>Accepted</th>
                <th>Open quantity</th>
                <th>PO unit cost</th>
                <th>Job</th>
              </tr>
            </thead>
            <tbody>
              {detail.lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <strong>{line.material_name}</strong>
                    {line.description && (
                      <small class="workspace-help">
                        {" "}
                        · {line.description}
                      </small>
                    )}
                  </td>
                  <td>
                    {units(line.quantity_milli)} {line.unit}
                  </td>
                  <td>
                    {units(line.received_milli)} {line.unit}
                  </td>
                  <td>
                    {units(line.remaining_milli)} {line.unit}
                  </td>
                  <td>{money(line.unit_cost_cents)}</td>
                  <td>
                    {line.job_id ? (
                      <Button onClick={() => navigate("/jobs/" + line.job_id)}>
                        {line.job_identifier || "Linked job"}
                      </Button>
                    ) : (
                      "Stock purchase"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {["closed", "cancelled"].includes(detail.order.status) && (
            <Notice>
              Unreceived quantities are retained for history. This order no
              longer authorizes receiving or an open purchase commitment.
            </Notice>
          )}
          <TicketDocuments
            key={"po-docs-" + detail.order.id}
            target={{ orderId: detail.order.id }}
          />
          <h3>Receiving history</h3>
          {!detail.receipts.length ? (
            <p class="workspace-help">No deliveries recorded.</p>
          ) : (
            <Table label="Purchase receipts">
              <thead>
                <tr>
                  <th>Recorded</th>
                  <th>Material / packing slip</th>
                  <th>Accepted</th>
                  <th>Rejected</th>
                  <th>Actual unit cost</th>
                  <th>Reason / documents</th>
                </tr>
              </thead>
              <tbody>
                {detail.receipts.map((row) => {
                  const line = detail.lines.find((l) => l.id === row.line_id);
                  return (
                    <tr key={row.id}>
                      <td>
                        {formatTimestamp(
                          row.created_at,
                          company.timeZone || undefined,
                        )}
                      </td>
                      <td>
                        {line?.material_name || "Purchase line"}
                        {row.packing_slip && " · " + row.packing_slip}
                      </td>
                      <td>
                        {units(row.accepted_milli)} {line?.unit}
                      </td>
                      <td>
                        {units(row.rejected_milli)} {line?.unit}
                      </td>
                      <td>{money(row.unit_cost_cents)}</td>
                      <td>
                        {row.reason}
                        <Button onClick={() => setReceiptDocument(row.id)}>
                          Delivery documents
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          <div class="inventory-toolbar">
            <Button
              disabled={receiptPage === 1}
              onClick={() => setReceiptPage(receiptPage - 1)}
            >
              Previous receipts
            </Button>
            <span>Page {receiptPage}</span>
            <Button
              disabled={!detail.hasMoreReceipts}
              onClick={() => setReceiptPage(receiptPage + 1)}
            >
              Next receipts
            </Button>
          </div>
          <p class="workspace-help">
            Receiving values accepted material only. PO tax and freight remain
            commitment terms until landed-cost allocation is implemented. No
            vendor bill, payment, email or QuickBooks posting is made.
          </p>
        </section>
      )}
      {receiptDocument && (
        <Sheet close={() => setReceiptDocument(null)}>
          <DialogTitle>Delivery documents</DialogTitle>
          <Button onClick={() => setReceiptDocument(null)}>
            Close delivery documents
          </Button>
          <TicketDocuments target={{ receiptId: receiptDocument }} />
        </Sheet>
      )}
      {directory && (
        <Sheet close={() => setDirectory(false)}>
          <DialogTitle>Suppliers</DialogTitle>
          <div class="inventory-toolbar">
            <Button
              disabled={readOnly}
              onClick={() => {
                setDirectory(false);
                setSupplier("new");
              }}
            >
              Add supplier
            </Button>
            <Button onClick={() => setDirectory(false)}>Close</Button>
          </div>
          {options?.suppliers.map((s) => (
            <div class="inventory-toolbar" key={s.id}>
              <strong>{s.name}</strong>
              <span>
                {s.code} · {s.active ? "Active" : "Inactive"}
              </span>
              <Button
                disabled={readOnly}
                onClick={() => {
                  setDirectory(false);
                  setSupplier(s);
                }}
              >
                Edit {s.name}
              </Button>
            </div>
          ))}
        </Sheet>
      )}
      {supplier && (
        <SupplierForm
          supplier={supplier === "new" ? null : supplier}
          disabled={readOnly}
          close={() => setSupplier(null)}
          saved={(r) => saved(r)}
        />
      )}
      {editing && options && (
        <OrderForm
          detail={editing === "new" ? null : editing}
          options={options}
          disabled={readOnly}
          close={() => setEditing(null)}
          saved={(r) => saved(r, true)}
        />
      )}
      {action && detail && (
        <ActionForm
          action={action}
          detail={detail}
          disabled={readOnly}
          close={() => setAction("")}
          saved={(r) => saved(r)}
        />
      )}
      {receiving && detail && (
        <ReceiveForm
          detail={detail}
          disabled={readOnly}
          close={() => setReceiving(false)}
          saved={(r) => saved(r)}
        />
      )}
    </div>
  );
}
function SupplierForm({
  supplier: s,
  disabled,
  close,
  saved,
}: FormProps & { supplier: Supplier | null }) {
  const [id] = useState(() => s?.id || crypto.randomUUID()),
    [form, setForm] = useState({
      code: s?.code || "",
      name: s?.name || "",
      contactName: s?.contact_name || "",
      email: s?.email || "",
      phone: s?.phone || "",
      address: s?.address || "",
      terms: s?.terms || "",
      reason: "",
    }),
    [active, setActive] = useState(s ? !!s.active : true),
    cmd = usePurchaseCommand(
      "/api/service/purchasing/suppliers",
      saved,
      disabled,
    );
  const fields: {
    key: keyof typeof form;
    label: string;
    max: number;
    required?: boolean;
    type?: string;
  }[] = [
    { key: "code", label: "Supplier code", max: 32, required: true },
    { key: "name", label: "Supplier name", max: 160, required: true },
    { key: "contactName", label: "Contact name", max: 120 },
    { key: "email", label: "Contact email", max: 254, type: "email" },
    { key: "phone", label: "Phone", max: 80 },
    { key: "address", label: "Address", max: 2000 },
    { key: "terms", label: "Default payment terms", max: 2000 },
    {
      key: "reason",
      label: "Supplier change reason",
      max: 1000,
      required: true,
    },
  ];
  return (
    <Sheet close={close}>
      <DialogTitle>{s ? "Edit supplier" : "Add supplier"}</DialogTitle>
      {cmd.error && <Notice tone="danger">{cmd.error}</Notice>}
      <form
        class="sales-form"
        onSubmit={(e) => {
          e.preventDefault();
          void cmd.send(() => ({
            id,
            expectedVersion: s?.version || 0,
            ...form,
            active,
          }));
        }}
      >
        {fields.map((f) => (
          <TextField
            key={f.key}
            label={f.label}
            required={f.required}
            type={f.type || "text"}
            maxLength={f.max}
            minLength={f.key === "reason" ? 10 : undefined}
            value={form[f.key]}
            disabled={cmd.locked}
            onInput={(e) => {
              const value = e.currentTarget.value;
              setForm((current) => ({ ...current, [f.key]: value }));
            }}
          />
        ))}
        <Checkbox
          label="Active supplier"
          checked={active}
          disabled={cmd.locked}
          onChange={(e) => setActive(e.currentTarget.checked)}
        />
        <AttemptNotice attempt={cmd.attempt} />
        <div class="inventory-toolbar">
          <Button
            type="submit"
            variant="primary"
            disabled={disabled || cmd.busy}
          >
            {cmd.attempt ? "Retry same supplier change" : "Save supplier"}
          </Button>
          <Button disabled={cmd.busy} onClick={close}>
            Close
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
interface DraftLine {
  id: string;
  materialId: string;
  jobId: string;
  description: string;
  quantity: string;
  cost: string;
}
function OrderForm({
  detail,
  options: o,
  disabled,
  close,
  saved,
}: FormProps & { detail: PurchaseDetail | null; options: PurchaseOptions }) {
  const [id] = useState(() => detail?.order.id || crypto.randomUUID()),
    [supplier, setSupplier] = useState(detail?.order.supplier_id || "none"),
    [location, setLocation] = useState(detail?.order.location_id || "none");
  const [form, setForm] = useState({
    expectedDate: detail?.order.expected_date || "",
    terms: detail?.order.terms || "",
    notes: detail?.order.notes || "",
    tax: String((detail?.order.tax_basis_points || 0) / 100),
    freight: String((detail?.order.freight_cents || 0) / 100),
    reason: "",
  });
  const empty = (): DraftLine => ({
    id: crypto.randomUUID(),
    materialId: o.materials[0]?.id || "none",
    jobId: "none",
    description: "",
    quantity: "1",
    cost: "",
  });
  const [lines, setLines] = useState<DraftLine[]>(
    detail
      ? detail.lines.map((l) => ({
          id: l.id,
          materialId: l.material_id,
          jobId: l.job_id || "none",
          description: l.description,
          quantity: String(l.quantity_milli / 1000),
          cost: String(l.unit_cost_cents / 100),
        }))
      : [empty()],
  );
  const cmd = usePurchaseCommand(
      "/api/service/purchasing/orders",
      saved,
      disabled,
    ),
    update = (id: string, key: keyof DraftLine, value: string) =>
      setLines((current) =>
        current.map((l) => (l.id === id ? { ...l, [key]: value } : l)),
      );
  return (
    <Sheet close={close}>
      <DialogTitle>
        {detail ? "Edit " + detail.order.number : "New purchase order"}
      </DialogTitle>
      {cmd.error && <Notice tone="danger">{cmd.error}</Notice>}
      <form
        class="sales-form"
        onSubmit={(e) => {
          e.preventDefault();
          void cmd.send(() => ({
            id,
            expectedVersion: detail?.order.version || 0,
            supplierId: supplier,
            locationId: location,
            currency: "USD",
            expectedDate: form.expectedDate || null,
            terms: form.terms,
            notes: form.notes,
            taxBasisPoints: scaledQuantity(form.tax, 2),
            freightCents: scaledQuantity(form.freight, 2),
            reason: form.reason,
            lines: lines.map((l) => ({
              id: l.id,
              materialId: l.materialId,
              jobId: l.jobId === "none" ? null : l.jobId,
              description: l.description,
              quantityMilli: scaledQuantity(l.quantity, 3),
              unitCostCents: scaledQuantity(l.cost, 2),
            })),
          }));
        }}
      >
        <Select
          label="Supplier"
          value={supplier}
          disabled={cmd.locked}
          options={[
            { value: "none", label: "Choose supplier" },
            ...o.suppliers
              .filter((s) => s.active || s.id === supplier)
              .map((s) => ({
                value: s.id,
                label: s.name + (s.active ? "" : " (inactive)"),
              })),
          ]}
          onValueChange={(value) => {
            setSupplier(value);
            setForm((f) => ({
              ...f,
              terms: o.suppliers.find((s) => s.id === value)?.terms || "",
            }));
          }}
        />
        <Select
          label="Ship-to stock location"
          value={location}
          disabled={cmd.locked}
          options={[
            { value: "none", label: "Choose warehouse or vehicle stock" },
            ...o.locations
              .filter((l) => l.active)
              .map((l) => ({ value: l.id, label: l.name + " · " + l.code })),
          ]}
          onValueChange={setLocation}
        />
        <TextField
          label="Expected delivery"
          type="date"
          value={form.expectedDate}
          disabled={cmd.locked}
          onInput={(e) => {
            const value = e.currentTarget.value;
            setForm((f) => ({ ...f, expectedDate: value }));
          }}
        />
        <h3>Materials</h3>
        {lines.map((l, i) => (
          <fieldset class="purchase-line" key={l.id}>
            <legend>Line {i + 1}</legend>
            <Select
              label={"Material " + (i + 1)}
              value={l.materialId}
              disabled={cmd.locked}
              options={o.materials.map((m) => ({
                value: m.id,
                label: m.name + " · " + m.unit,
              }))}
              onValueChange={(value) => update(l.id, "materialId", value)}
            />
            <div class="purchase-line-values">
              <TextField
                label={"Quantity " + (i + 1)}
                required
                value={l.quantity}
                disabled={cmd.locked}
                onInput={(e) => update(l.id, "quantity", e.currentTarget.value)}
              />
              <TextField
                label={"PO unit cost (USD) " + (i + 1)}
                required
                value={l.cost}
                disabled={cmd.locked}
                onInput={(e) => update(l.id, "cost", e.currentTarget.value)}
              />
            </div>
            <Select
              label={"Purpose / job " + (i + 1)}
              value={l.jobId}
              disabled={cmd.locked}
              options={[
                { value: "none", label: "Stock purchase" },
                ...o.jobs.map((j) => ({ value: j.id, label: j.identifier })),
              ]}
              onValueChange={(value) => update(l.id, "jobId", value)}
            />
            <TextField
              label={"Line description " + (i + 1)}
              maxLength={500}
              value={l.description}
              disabled={cmd.locked}
              onInput={(e) =>
                update(l.id, "description", e.currentTarget.value)
              }
            />
            <Button
              disabled={cmd.locked || lines.length === 1}
              onClick={() =>
                setLines((current) => current.filter((row) => row.id !== l.id))
              }
            >
              Remove line {i + 1}
            </Button>
          </fieldset>
        ))}
        <Button
          disabled={cmd.locked || lines.length >= 100}
          onClick={() => setLines((current) => [...current, empty()])}
        >
          Add material line
        </Button>
        {(
          [
            { key: "terms", label: "Payment / purchase terms", max: 2000 },
            { key: "notes", label: "Purchase notes", max: 2000 },
            { key: "tax", label: "Estimated tax (%)", max: 12 },
            { key: "freight", label: "Estimated freight (USD)", max: 16 },
            { key: "reason", label: "Purchase change reason", max: 1000 },
          ] as const
        ).map((f) => (
          <TextField
            key={f.key}
            label={f.label}
            required={["tax", "freight", "reason"].includes(f.key)}
            minLength={f.key === "reason" ? 10 : undefined}
            maxLength={f.max}
            value={form[f.key]}
            disabled={cmd.locked}
            onInput={(e) => {
              const value = e.currentTarget.value;
              setForm((current) => ({ ...current, [f.key]: value }));
            }}
          />
        ))}
        <p class="workspace-help">
          Job links record purchase purpose. Material enters ship-to stock on
          acceptance and reaches job costs only when used; ordering does not
          consume it.
        </p>
        <AttemptNotice attempt={cmd.attempt} />
        <div class="inventory-toolbar">
          <Button
            type="submit"
            variant="primary"
            disabled={
              disabled ||
              cmd.busy ||
              supplier === "none" ||
              location === "none" ||
              !o.materials.length
            }
          >
            {cmd.attempt ? "Retry same draft" : "Save draft"}
          </Button>
          <Button disabled={cmd.busy} onClick={close}>
            Close
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
function ActionForm({
  detail: d,
  action,
  disabled,
  close,
  saved,
}: FormProps & { detail: PurchaseDetail; action: string }) {
  const [reason, setReason] = useState(""),
    cmd = usePurchaseCommand(
      "/api/service/purchasing/actions",
      saved,
      disabled,
    );
  const titles: Record<string, string> = {
    approve: "Review & approve",
    issue: "Issue purchase order",
    return_to_draft: "Return to draft",
    cancel: "Cancel purchase order",
    close: "Close outstanding commitments",
  };
  return (
    <Sheet close={close}>
      <DialogTitle>
        {titles[action]} · {d.order.number}
      </DialogTitle>
      {cmd.error && <Notice tone="danger">{cmd.error}</Notice>}
      <p>
        {d.supplier.name} · {d.destination.name} · {money(d.totals.totalCents)}
      </p>
      <p class="workspace-help">
        {d.lines.length} material lines · {d.order.terms || "No terms recorded"}
      </p>
      {action === "issue" && (
        <Notice>
          Retains the approved supplier, destination and material terms as an
          immutable issued revision. This does not email or place an order with
          the supplier.
        </Notice>
      )}
      {action === "close" && (
        <Notice>
          Retains accepted stock and delivery evidence, and releases unreceived
          commitments. Closed orders cannot receive more material.
        </Notice>
      )}
      <form
        class="sales-form"
        onSubmit={(e) => {
          e.preventDefault();
          void cmd.send(() => ({
            orderId: d.order.id,
            expectedVersion: d.order.version,
            action,
            reason,
          }));
        }}
      >
        <TextField
          label="Review / decision reason"
          required
          minLength={10}
          maxLength={1000}
          value={reason}
          disabled={cmd.locked}
          onInput={(e) => setReason(e.currentTarget.value)}
        />
        <AttemptNotice attempt={cmd.attempt} />
        <div class="inventory-toolbar">
          <Button
            type="submit"
            variant="primary"
            disabled={disabled || cmd.busy}
          >
            {cmd.attempt ? "Retry same decision" : titles[action]}
          </Button>
          <Button disabled={cmd.busy} onClick={close}>
            Close
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
function ReceiveForm({
  detail: d,
  disabled,
  close,
  saved,
}: FormProps & { detail: PurchaseDetail }) {
  const [lineId, setLine] = useState(
      d.lines.find((l) => l.remaining_milli > 0)?.id || d.lines[0]?.id || "",
    ),
    [stock, setStock] = useState<StockDetail | null>(null),
    [loadError, setLoadError] = useState("");
  const selected = d.lines.find((l) => l.id === lineId)!;
  const defaults = (line: PurchaseLine) => ({
    delivered: String(line.remaining_milli / 1000),
    accepted: String(line.remaining_milli / 1000),
    rejected: "0",
    cost: String(line.unit_cost_cents / 100),
    packingSlip: "",
    reason: "",
    priceReason: "",
    overReason: "",
  });
  const [form, setForm] = useState(() => defaults(selected)),
    [over, setOver] = useState(false),
    cmd = usePurchaseCommand(
      "/api/service/purchasing/receipts",
      saved,
      disabled,
    );
  useEffect(() => {
    let live = true;
    void accountRequest<StockDetail>(
      "/api/service/inventory/locations/" + d.order.location_id,
    )
      .then((data) => {
        if (live) setStock(data);
      })
      .catch((e) => {
        if (live) setLoadError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <Sheet close={close}>
      <DialogTitle>Receive delivery · {d.order.number}</DialogTitle>
      {cmd.error && <Notice tone="danger">{cmd.error}</Notice>}
      {loadError && <Notice tone="danger">{loadError}</Notice>}
      <form
        class="sales-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!stock) return;
          void cmd.send(() => ({
            orderId: d.order.id,
            lineId,
            expectedVersion: d.order.version,
            expectedStockVersion:
              stock.stock.find((s) => s.material_id === selected.material_id)
                ?.version || 0,
            deliveredMilli: scaledQuantity(form.delivered),
            acceptedMilli: scaledQuantity(form.accepted),
            rejectedMilli: scaledQuantity(form.rejected),
            unitCostCents: scaledQuantity(form.cost, 2),
            packingSlip: form.packingSlip,
            reason: form.reason,
            priceVarianceReason: form.priceReason,
            approveOverReceipt: over,
            overReceiptReason: form.overReason,
          }));
        }}
      >
        <Select
          label="Purchase line"
          value={lineId}
          disabled={cmd.locked}
          options={d.lines.map((l) => ({
            value: l.id,
            label:
              l.material_name +
              " · " +
              units(l.remaining_milli) +
              " " +
              l.unit +
              " open",
          }))}
          onValueChange={(id) => {
            setLine(id);
            setForm(defaults(d.lines.find((l) => l.id === id)!));
            setOver(false);
          }}
        />
        <p class="workspace-help">
          Ship to {d.destination.name} · ordered{" "}
          {units(selected.quantity_milli)} {selected.unit} · accepted{" "}
          {units(selected.received_milli)} {selected.unit}. Only accepted
          material enters stock.
        </p>
        {(
          [
            { key: "delivered", label: "Delivered quantity", max: 20 },
            { key: "accepted", label: "Accepted quantity", max: 20 },
            { key: "rejected", label: "Rejected / damaged quantity", max: 20 },
            { key: "cost", label: "Actual unit cost (USD)", max: 20 },
            {
              key: "packingSlip",
              label: "Packing slip / delivery reference",
              max: 120,
            },
            {
              key: "priceReason",
              label: "Price variance review reason",
              max: 1000,
            },
            { key: "reason", label: "Receiving / rejection reason", max: 1000 },
          ] as const
        ).map((f) => (
          <TextField
            key={f.key}
            label={f.label}
            required={[
              "delivered",
              "accepted",
              "rejected",
              "cost",
              "reason",
            ].includes(f.key)}
            minLength={f.key === "reason" ? 10 : undefined}
            maxLength={f.max}
            value={form[f.key]}
            disabled={cmd.locked}
            onInput={(e) => {
              const value = e.currentTarget.value;
              setForm((current) => ({ ...current, [f.key]: value }));
            }}
          />
        ))}
        <Checkbox
          label="Approve accepted quantity above the order remainder"
          checked={over}
          disabled={cmd.locked}
          onChange={(e) => setOver(e.currentTarget.checked)}
        />
        {over && (
          <TextField
            label="Over-receipt approval reason"
            required
            minLength={10}
            maxLength={1000}
            value={form.overReason}
            disabled={cmd.locked}
            onInput={(e) => {
              const value = e.currentTarget.value;
              setForm((f) => ({ ...f, overReason: value }));
            }}
          />
        )}
        <p class="workspace-help">
          Accepted price updates the company average. Rejected goods stay
          outside stock. Freight/tax allocation, supplier returns and vendor
          bills are separate workflows.
        </p>
        <AttemptNotice attempt={cmd.attempt} />
        <div class="inventory-toolbar">
          <Button
            type="submit"
            variant="primary"
            disabled={disabled || cmd.busy || !stock}
          >
            {cmd.attempt ? "Retry same delivery" : "Post accepted delivery"}
          </Button>
          <Button disabled={cmd.busy} onClick={close}>
            Close
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
