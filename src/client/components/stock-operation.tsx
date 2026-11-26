import { useEffect, useState } from "preact/hooks";
import { accountRequest } from "../auth";
import { Button } from "./ui/button";
import { TextField } from "./ui/input";
import { Select } from "./ui/select";
import { DialogTitle } from "./ui/dialog";
import { Checkbox, Notice, Sheet } from "./ui/surfaces";
import {
  scaledQuantity,
  units,
  type CatalogItem,
  type StockDetail,
  type StockOptions,
  type StockUsage,
} from "../inventory-types";
export type StockAction =
  | "receipt"
  | "transfer"
  | "usage"
  | "return"
  | "adjustment"
  | "reversal";
const titles: Record<StockAction, string> = {
  receipt: "Receive stock",
  transfer: "Transfer stock",
  usage: "Use stock on job",
  return: "Return unused job stock",
  adjustment: "Review stock count variance",
  reversal: "Reverse stock movement",
};
export function StockOperation({
  kind,
  source,
  options,
  catalog,
  jobId,
  usage,
  movementId,
  initialMaterialId,
  disabled,
  close,
  saved,
}: {
  kind: StockAction;
  source: StockDetail;
  options: StockOptions;
  catalog: CatalogItem[];
  jobId?: string;
  usage?: StockUsage;
  movementId?: string;
  initialMaterialId?: string;
  disabled: boolean;
  close(): void;
  saved(): void;
}) {
  const [material, setMaterial] = useState(
      initialMaterialId || usage?.material_id ||
        source.stock.find((s) => s.quantity_milli > 0)?.material_id ||
        source.stock[0]?.material_id ||
        catalog[0]?.id ||
        "",
    ),
    [destination, setDestination] = useState("none"),
    [dest, setDest] = useState<StockDetail | null>(null),
    [destError, setDestError] = useState(""),
    [quantity, setQuantity] = useState(""),
    [cost, setCost] = useState(""),
    [reason, setReason] = useState(""),
    [delegation, setDelegation] = useState(""),
    [opening, setOpening] = useState(false),
    [approved, setApproved] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState<unknown | null>(null),
    [requestKey] = useState(() => crypto.randomUUID());
  const needsDestination = kind === "transfer" || kind === "return",
    locked = disabled || busy || attempt !== null,
    item = source.stock.find((s) => s.material_id === material),
    selected = catalog.find((m) => m.id === material),
    managed = options.managedMaterialIds.includes(material),
    needsOpening = kind === "receipt" && !managed && (selected?.in_stock ?? 0) > 0;
  useEffect(()=>{
    if(kind !== "receipt") return;
    setOpening(needsOpening);
    setQuantity(needsOpening ? String(selected!.in_stock) : "");
    setCost("");
  },[material,kind,needsOpening,selected?.in_stock]);
  useEffect(() => {
    let live = true;
    setDest(null);
    setDestError("");
    if (needsDestination && destination !== "none")
      void accountRequest<StockDetail>(
        "/api/service/inventory/locations/" + destination,
      )
        .then((d) => {
          if (live) setDest(d);
        })
        .catch((e) => {
          if (live) setDestError(e.message);
        });
    return () => {
      live = false;
    };
  }, [destination, needsDestination]);
  const choices =
    kind === "receipt"
      ? catalog
      : source.stock
          .filter(
            (s) =>
              (kind !== "usage" && kind !== "transfer") || s.quantity_milli > 0,
          )
          .map((s) => ({
            id: s.material_id,
            name: s.name,
            unit: s.unit,
          }));
  async function submit() {
    if (busy || disabled) return;
    setError("");
    let body = attempt;
    try {
      if (!body) {
        const base = { requestKey, reason };
        const qty = () => scaledQuantity(quantity);
        const unitCost = () => scaledQuantity(cost || "0", 2);
        const version = item?.version || 0;
        if (kind === "receipt")
          body = {
            ...base,
            materialId: material,
            locationId: source.location.id,
            quantityMilli: qty(),
            unitCostCents: unitCost(),
            expectedVersion: version,
            opening,
          };
        if (kind === "transfer" || kind === "return") {
          if (!dest)
            throw Error("Choose a destination and wait for its stock to load.");
          const expectedToVersion =
            dest.stock.find((s) => s.material_id === material)?.version || 0;
          body =
            kind === "transfer"
              ? {
                  ...base,
                  materialId: material,
                  fromLocationId: source.location.id,
                  toLocationId: destination,
                  quantityMilli: qty(),
                  expectedFromVersion: version,
                  expectedToVersion,
                }
              : {
                  ...base,
                  jobMaterialId: usage!.job_material_id,
                  toLocationId: destination,
                  quantityMilli: qty(),
                  expectedUsageVersion: usage!.version,
                  expectedToVersion,
                  delegationReason: delegation,
                };
        }
        if (kind === "usage")
          body = {
            ...base,
            materialId: material,
            locationId: source.location.id,
            quantityMilli: qty(),
            expectedVersion: version,
            jobId,
            delegationReason: delegation,
          };
        if (kind === "adjustment")
          body = {
            ...base,
            materialId: material,
            locationId: source.location.id,
            countedMilli: qty(),
            expectedVersion: version,
            unitCostCents: unitCost(),
            approved,
          };
        if (kind === "reversal") body = { ...base, movementId };
        setAttempt(body);
      }
      setBusy(true);
      await accountRequest(
        "/api/service/inventory/movements/" + kind,
        "POST",
        body,
      );
      saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet close={close}>
      <header class="dispatch-sheet-header">
        <DialogTitle>{titles[kind]}</DialogTitle>
        <Button disabled={busy} onClick={close}>
          Close
        </Button>
      </header>
      <p class="workspace-help">
        {kind === "receipt" ? "Receiving location: " : "Source location: "}{source.location.name} · quantities use the shared material catalog
        unit. Every posted movement retains its source and reason.
      </p>
      {error && <Notice tone="danger">{error}</Notice>}
      {attempt !== null && error && (
        <Notice tone="warning">
          This request is frozen so retrying cannot duplicate a movement. Retry
          the same request, or close and inspect the stock ledger before
          starting a new operation.
        </Notice>
      )}
      <form
        class="sales-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {kind !== "reversal" && kind !== "return" && (
          <Select
            label="Material"
            value={material}
            disabled={locked}
            onValueChange={setMaterial}
            options={choices.map((m) => ({
              value: m.id,
              label: m.name + " · " + m.unit,
            }))}
          />
        )}
        {kind === "return" && (
          <p>
            {usage?.name} ·{" "}
            {units(usage!.quantity_milli - usage!.returned_milli)} {usage?.unit}{" "}
            remaining recorded usage
          </p>
        )}
        {kind !== "reversal" && (
          <TextField
            label={needsOpening ? "Existing stock to assign" : kind === "adjustment" ? "Physically counted quantity" : "Quantity"}
            inputMode="decimal"
            required
            value={quantity}
            disabled={locked}
            onInput={(e) => setQuantity(e.currentTarget.value)}
            hint={
              kind === "return"
                ? undefined
                : needsOpening
                  ? `Existing catalog stock awaiting allocation: ${selected?.in_stock} ${selected?.unit}. Currently assigned here: ${units(item?.quantity_milli ?? 0)}.`
                  : `At ${source.location.name}: ${units(item?.quantity_milli ?? 0)} ${item?.unit || selected?.unit || ""}. Company total: ${selected?.in_stock ?? 0} ${selected?.unit || ""}.`
            }
          />
        )}
        {(kind === "receipt" || kind === "adjustment") && (
          <TextField
            label="Reviewed unit cost (USD)"
            inputMode="decimal"
            required
            value={cost}
            disabled={locked}
            onInput={(e) => setCost(e.currentTarget.value)}
            hint={
              kind === "adjustment"
                ? "Used for positive count variance; negative variance retains source valuation."
                : "Valuation cost, not the customer selling price."
            }
          />
        )}
        {kind === "receipt" && !managed && (
          <>
            <Checkbox
              label="Adopt existing catalog stock as an opening balance"
              checked={opening}
              disabled={locked || needsOpening}
              onChange={(e) => setOpening(e.currentTarget.checked)}
            />
            {opening && (
              <Notice tone="warning">
                Opening quantity must match the existing catalog stock:{" "}
                {selected?.in_stock ?? 0} {selected?.unit}. Adoption does not
                add new purchased stock. The whole existing balance is assigned once; use a transfer afterward to split it between locations.
              </Notice>
            )}
          </>
        )}
        {needsDestination && (
          <>
            <Select
              label="Destination"
              value={destination}
              disabled={locked}
              onValueChange={setDestination}
              options={[
                { value: "none", label: "Choose destination" },
                ...options.locations
                  .filter(
                    (l) =>
                      l.active &&
                      (kind === "return" || l.id !== source.location.id),
                  )
                  .map((l) => ({
                    value: l.id,
                    label: l.name + " · " + l.code,
                  })),
              ]}
            />
            {destError && <Notice tone="danger">{destError}</Notice>}
            {destination !== "none" && !dest && !destError && (
              <p role="status">Loading destination stock…</p>
            )}
          </>
        )}
        {(kind === "usage" || kind === "return") && options.canManage && (
          <TextField
            label="Acting for the assigned technician: reason"
            value={delegation}
            maxLength={1000}
            disabled={locked}
            onInput={(e) => setDelegation(e.currentTarget.value)}
            hint="Required when your login is not the mapped assigned technician."
          />
        )}
        <TextField
          label="Movement reason"
          value={reason}
          required
          minLength={10}
          maxLength={1000}
          disabled={locked}
          onInput={(e) => setReason(e.currentTarget.value)}
        />
        {kind === "adjustment" && (
          <Checkbox
            label="I reviewed and approve this physical count variance"
            checked={approved}
            disabled={locked}
            onChange={(e) => setApproved(e.currentTarget.checked)}
          />
        )}
        {kind === "reversal" && (
          <Notice tone="warning">
            Only the latest unchanged stock movement can be reversed. Job usage
            must be returned through its job record. No evidence is deleted.
          </Notice>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={
            busy ||
            disabled ||
            (!attempt && reason.trim().length < 10) ||
            (!attempt && kind === "adjustment" && !approved) ||
            (!attempt && needsDestination && !dest)
          }
        >
          {busy
            ? "Posting…"
            : attempt
              ? "Retry same request"
              : opening ? "Assign existing stock to location" : "Post stock movement"}
        </Button>
      </form>
    </Sheet>
  );
}
