import { useState } from "preact/hooks";
import { accountRequest } from "../../auth";
import type { LookupPage } from "../../quote-types";
import { estimateKinds, estimateLabels } from "../../estimating-types";
import type { EstimateKind } from "../../estimating-types";
import type { DraftLine, MaterialCost } from "../../quote-types";
import { scaledText } from "../../quote-input.mjs";
import { Button } from "../ui/button";
import { TextField } from "../ui/input";
import { Select } from "../ui/select";
import { Checkbox } from "../ui/surfaces";
import { SearchPicker } from "./search-picker";

export function QuoteLineEditor({
  line,
  index,
  opportunityId,
  material,
  disabled: locked,
  patch,
  remove,
  rememberMaterial,
  onRefreshing,
}: {
  line: DraftLine;
  index: number;
  opportunityId: string;
  material?: MaterialCost;
  disabled: boolean;
  patch: (data: Partial<DraftLine>) => void;
  remove: () => void;
  rememberMaterial: (row: MaterialCost) => void;
  onRefreshing: (active: boolean) => void;
}) {
  const [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState("");
  const disabled = locked || refreshing;
  async function refreshCost() {
    if (!line.materialId || !opportunityId) return;
    setRefreshing(true);
    onRefreshing(true);
    setError("");
    try {
      const data = await accountRequest<LookupPage<MaterialCost>>(
        "/api/sales/quotes/options?kind=materials&opportunityId=" +
          opportunityId +
          "&materialId=" +
          line.materialId,
      );
      const row = data.rows[0];
      if (!row) throw new Error("This material is no longer available.");
      rememberMaterial(row);
      if (row.unitCostCents === null)
        throw new Error(
          "No company stock cost is available. Enter a reviewed cost and override reason.",
        );
      patch({
        unitCost: scaledText(row.unitCostCents, 2),
        costOverrideReason: "",
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
      onRefreshing(false);
    }
  }
  const labor = ["technician", "apprentice", "after_hours"].includes(line.kind);
  const travel = ["distance", "fuel"].includes(line.kind);
  function kind(value: string) {
    setError("");
    const next = value as EstimateKind;
    patch({
      kind: next,
      materialId: null,
      costOverrideReason: "",
      headcount: "1",
      travelGroup: ["distance", "fuel"].includes(next)
        ? line.travelGroup || "visit-1"
        : "",
      includesFuel: false,
    });
  }
  return (
    <article class="ui-card quote-line">
      <header>
        <h3>Line {index + 1}</h3>
        <span>{estimateLabels[line.kind]}</span>
        <Button
          variant="ghost"
          disabled={disabled}
          onClick={remove}
          aria-label={`Remove estimate line ${index + 1}`}
        >
          Remove
        </Button>
      </header>
      <div class="quote-line-main">
        <Select
          label={`Line ${index + 1} type`}
          value={line.kind}
          disabled={disabled}
          options={estimateKinds.map((value) => ({
            value,
            label: estimateLabels[value],
          }))}
          onValueChange={kind}
        />
        <TextField
          label={`Line ${index + 1} description`}
          value={line.description}
          disabled={disabled}
          required
          maxLength={500}
          onInput={(e) => patch({ description: e.currentTarget.value })}
        />
      </div>
      {line.kind === "material" && (
        <SearchPicker<MaterialCost>
          label={`Material for line ${index + 1}`}
          endpoint={
            "/api/sales/quotes/options?kind=materials&opportunityId=" +
            opportunityId
          }
          disabled={disabled || !opportunityId}
          selected={
            line.materialId
              ? {
                  id: line.materialId,
                  label: material
                    ? `${material.name} · ${material.unit}`
                    : line.description || "Selected material",
                }
              : null
          }
          format={(row) => `${row.name} · ${row.unit}`}
          change={(row) => {
            rememberMaterial(row);
            patch({
              materialId: row.id,
              description: row.name,
              unitCost:
                row.unitCostCents === null
                  ? "0.00"
                  : scaledText(row.unitCostCents, 2),
              costOverrideReason: "",
            });
          }}
        />
      )}
      <div class="quote-line-rates">
        <TextField
          label={labor ? "Hours per person" : "Quantity"}
          type="text"
          inputMode="decimal"
          value={line.quantity}
          disabled={disabled}
          required
          onInput={(e) => patch({ quantity: e.currentTarget.value })}
        />
        {labor && (
          <TextField
            label="Headcount"
            type="text"
            inputMode="numeric"
            value={line.headcount}
            disabled={disabled}
            required
            onInput={(e) => patch({ headcount: e.currentTarget.value })}
          />
        )}
        <TextField
          label={labor ? "Cost / hour ($)" : "Unit cost ($)"}
          type="text"
          inputMode="decimal"
          value={line.unitCost}
          disabled={disabled}
          required
          onInput={(e) => patch({ unitCost: e.currentTarget.value })}
        />
        <TextField
          label={labor ? "Sell / hour ($)" : "Unit selling price ($)"}
          type="text"
          inputMode="decimal"
          value={line.unitSell}
          disabled={disabled}
          required
          onInput={(e) => patch({ unitSell: e.currentTarget.value })}
        />
        <TextField
          label="Discount (%)"
          type="text"
          inputMode="decimal"
          value={line.discount}
          disabled={disabled}
          required
          onInput={(e) => patch({ discount: e.currentTarget.value })}
        />
      </div>
      {line.kind === "material" && (
        <div class="quote-material-evidence">
          <p class="workspace-help">
            Inventory cost evidence:{" "}
            {material?.unitCostCents != null
              ? "$" +
                scaledText(material.unitCostCents, 2) +
                " / " +
                material.unit
              : "No stock cost available"}
            . A missing or different cost needs a review reason; the server
            captures the latest inventory evidence when calculating or saving.
          </p>
          <Button
            disabled={disabled || !line.materialId}
            onClick={() => void refreshCost()}
          >
            Use latest inventory cost
          </Button>
          {error && (
            <p role="alert" class="quote-field-error">
              {error}
            </p>
          )}
          <TextField
            label="Material cost override reason"
            value={line.costOverrideReason}
            disabled={disabled}
            maxLength={1000}
            onInput={(e) =>
              patch({ costOverrideReason: e.currentTarget.value })
            }
          />
        </div>
      )}
      {travel && (
        <TextField
          label="Travel group"
          value={line.travelGroup}
          disabled={disabled}
          required
          maxLength={80}
          hint="Use the same group for distance and fuel for one trip."
          onInput={(e) => patch({ travelGroup: e.currentTarget.value })}
        />
      )}
      {line.kind === "distance" && (
        <Checkbox
          label="This distance rate already includes fuel"
          checked={line.includesFuel}
          disabled={disabled}
          onChange={(e) => patch({ includesFuel: e.currentTarget.checked })}
        />
      )}
      <p class="workspace-help">
        {labor
          ? "Uses the shared Labor tax category."
          : line.kind === "material"
            ? "Uses the Materials tax category."
            : "Not taxed under company billing policy."}
      </p>
    </article>
  );
}
