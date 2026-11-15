import { useEffect, useState } from "preact/hooks";
import { accountRequest } from "../../auth";
import { Button } from "../ui/button";
import { TextField } from "../ui/input";
import { Checkbox, Notice, Textarea } from "../ui/surfaces";
interface Line {
  sourceId: string;
  rateCents: number;
  billableMinutes?: number;
  reason: string;
}
interface Draft {
  version: number;
  stale: boolean;
  data: {
    labor: Line[];
    materials: Line[];
    taxBasisPoints: number;
    notes: string;
    subtotalCents: number;
    taxCents: number;
    totalCents: number;
  };
}
interface Data {
  job: { id: string; identifier: string };
  sourceToken: string;
  technicianName: string;
  labor: {
    id: string;
    worked_minutes: number;
    requested_billable_minutes: number;
    work_type: string;
  }[];
  materials: {
    id: string;
    material_name: string;
    quantity: number;
    unit: string;
    unit_cost: number;
  }[];
  blockers: string[];
  draft: Draft | null;
}
const money = (cents: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
const decimal = (text: string) => {
  if (!/^\d+(?:\.\d{1,2})?$/.test(text))
    throw Error(
      "Enter a nonnegative amount with no more than two decimal places.",
    );
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw Error("Amount is too large.");
  return cents;
};
export function BillingPreparation({
  jobId,
  disabled,
}: {
  jobId: string;
  disabled: boolean;
}) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    void accountRequest<Data>("/api/service/jobs/" + jobId + "/billing")
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [jobId, revision]);
  return (
    <section class="sales-details">
      <h3>Step 3 · Billing preparation</h3>
      <p class="workspace-help">
        Prepare On-Demand T&M charges from approved work. Saving a draft does
        not approve billing or create an invoice, payment or accounting entry.
      </p>
      <Button
        disabled={busy || disabled}
        onClick={() => setRevision(revision + 1)}
      >
        Reload billing sources
      </Button>
      {error && <Notice tone="danger">{error}</Notice>}
      {!data && !error && (
        <p role="status">Loading approved billing sources…</p>
      )}
      {data && (
        <>
          {data.blockers.map((message) => (
            <Notice key={message} tone="warning">
              {message}
            </Notice>
          ))}
          {data.blockers.length === 0 && (
            <BillingForm
              key={
                jobId +
                "-" +
                (data.draft?.version || 0) +
                "-" +
                data.sourceToken
              }
              data={data}
              disabled={disabled || busy}
              save={async (body) => {
                setBusy(true);
                setError("");
                try {
                  setData(
                    await accountRequest<Data>(
                      "/api/service/jobs/" + jobId + "/billing-draft",
                      "PUT",
                      body,
                    ),
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
function BillingForm({
  data,
  disabled,
  save,
}: {
  data: Data;
  disabled: boolean;
  save(body: unknown): Promise<void>;
}) {
  const saved = data.draft?.data;
  const [labor, setLabor] = useState(
    data.labor.map((e) => {
      const old = saved?.labor.find((x) => x.sourceId === e.id);
      return {
        sourceId: e.id,
        rate: old ? (old.rateCents / 100).toFixed(2) : "",
        billableMinutes: old?.billableMinutes ?? e.requested_billable_minutes,
        reason: old?.reason || "",
      };
    }),
  );
  const [materials, setMaterials] = useState(
    data.materials.map((e) => {
      const old = saved?.materials.find((x) => x.sourceId === e.id);
      return {
        sourceId: e.id,
        rate: old ? (old.rateCents / 100).toFixed(2) : "",
        reason: old?.reason || "",
      };
    }),
  );
  const [tax, setTax] = useState(
      saved ? (saved.taxBasisPoints / 100).toFixed(2) : "0",
    ),
    [notes, setNotes] = useState(saved?.notes || ""),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      class="sales-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (disabled || !confirmed) return;
        setError("");
        try {
          const body = {
            expectedVersion: data.draft?.version || 0,
            sourceToken: data.sourceToken,
            currency: "USD",
            labor: labor.map(({ rate, ...row }) => ({
              ...row,
              rateCents: decimal(rate),
            })),
            materials: materials.map(({ rate, ...row }) => ({
              ...row,
              rateCents: decimal(rate),
            })),
            taxBasisPoints: decimal(tax),
            notes,
          };
          void save(body);
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      {data.draft?.stale && (
        <Notice tone="warning">
          The saved draft refers to older sources. Review all current
          quantities, labor and selling prices before saving again.
        </Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      {data.labor.map((entry, index) => (
        <fieldset class="sales-stage-editor" key={entry.id} disabled={disabled}>
          <legend>
            {data.technicianName} · {entry.work_type}
          </legend>
          <p>
            {entry.worked_minutes} worked minutes ·{" "}
            {entry.requested_billable_minutes} requested billable minutes
          </p>
          <div class="sales-form-grid">
            <TextField
              label="Billable minutes"
              type="number"
              min={0}
              max={entry.worked_minutes}
              step={1}
              required
              value={labor[index].billableMinutes}
              onInput={(e) =>
                setLabor(
                  labor.map((row, i) =>
                    i === index
                      ? {
                          ...row,
                          billableMinutes: Number(e.currentTarget.value),
                        }
                      : row,
                  ),
                )
              }
            />
            <TextField
              label="Hourly selling rate (USD)"
              inputMode="decimal"
              required
              value={labor[index].rate}
              onInput={(e) =>
                setLabor(
                  labor.map((row, i) =>
                    i === index ? { ...row, rate: e.currentTarget.value } : row,
                  ),
                )
              }
            />
          </div>
          <TextField
            label="Labor billing review reason"
            maxLength={1000}
            hint="Required if billable minutes differ from the technician’s request or the rate is zero."
            value={labor[index].reason}
            onInput={(e) =>
              setLabor(
                labor.map((row, i) =>
                  i === index ? { ...row, reason: e.currentTarget.value } : row,
                ),
              )
            }
          />
        </fieldset>
      ))}
      {data.materials.map((item, index) => (
        <fieldset class="sales-stage-editor" key={item.id} disabled={disabled}>
          <legend>{item.material_name}</legend>
          <p>
            {item.quantity} {item.unit} used · recorded unit cost{" "}
            {money(Math.round(item.unit_cost * 100))}
          </p>
          <TextField
            label="Material selling price per unit (USD)"
            inputMode="decimal"
            required
            value={materials[index].rate}
            hint="Set the selling price explicitly; recorded cost is not a selling price."
            onInput={(e) =>
              setMaterials(
                materials.map((row, i) =>
                  i === index ? { ...row, rate: e.currentTarget.value } : row,
                ),
              )
            }
          />
          <TextField
            label="Material billing review reason"
            maxLength={1000}
            hint="Required for no-charge material."
            value={materials[index].reason}
            onInput={(e) =>
              setMaterials(
                materials.map((row, i) =>
                  i === index ? { ...row, reason: e.currentTarget.value } : row,
                ),
              )
            }
          />
        </fieldset>
      ))}
      <TextField
        label="Tax rate (%)"
        inputMode="decimal"
        required
        disabled={disabled}
        value={tax}
        onInput={(e) => setTax(e.currentTarget.value)}
        hint="Apply the company’s reviewed tax treatment; the application does not determine taxability."
      />
      <label class="ui-field">
        Billing notes
        <Textarea
          aria-label="Billing notes"
          disabled={disabled}
          maxLength={4000}
          value={notes}
          onInput={(e) => setNotes(e.currentTarget.value)}
        />
      </label>
      <Checkbox
        label="I reviewed the current source entries and selling prices"
        checked={confirmed}
        disabled={disabled}
        onChange={(e) => setConfirmed(e.currentTarget.checked)}
      />
      <Button type="submit" variant="primary" disabled={disabled || !confirmed}>
        Save billing preparation draft
      </Button>
      {saved && !data.draft?.stale && (
        <Notice tone="info">
          Saved draft totals: subtotal {money(saved.subtotalCents)}, tax{" "}
          {money(saved.taxCents)}, total {money(saved.totalCents)}. These totals
          reflect the saved draft; save again after changing inputs.
        </Notice>
      )}
    </form>
  );
}
