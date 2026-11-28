import "./billing-profile-settings.css";
import { useEffect, useRef, useState } from "preact/hooks";
import { accountRequest, AccountRequestError } from "../auth";
import { useConnectivity } from "../hooks/use-connectivity";
import { taxCategories, taxLabels } from "../estimating-types";
import type {
  BillingProfile,
  BillingProfileConfig,
  BillingProfilePage,
  TaxRule,
} from "../estimating-types";
import { Button } from "./ui/button";
import { TextField } from "./ui/input";
import { Select } from "./ui/select";
import { Checkbox, Notice } from "./ui/surfaces";
const fresh = (): BillingProfileConfig => ({
  schemaVersion: 4,
  name: "",
  state: "",
  jurisdiction: "",
  segment: "commercial",
  effectiveFrom: new Date().toLocaleDateString("en-CA"),
  effectiveTo: null,
  active: true,
  reviewNote: "",
  rules: taxCategories.map((kind) => ({
    kind,
    treatment: "exclusive",
    rateBasisPoints: 0,
    note: "",
  })),
});
function RateField({
  kind,
  value,
  disabled,
  change,
}: {
  kind: string;
  value: number;
  disabled: boolean;
  change(value: number): void;
}) {
  const [raw, setRaw] = useState((value / 100).toFixed(2));
  return (
    <TextField
      label={kind + " tax rate (%)"}
      type="number"
      min="0"
      max="100"
      step="0.01"
      required
      value={raw}
      disabled={disabled}
      onInput={(e) => {
        setRaw(e.currentTarget.value);
        const n = Number(e.currentTarget.value);
        if (Number.isFinite(n)) change(Math.round(n * 100));
      }}
    />
  );
}
export function BillingProfileSettings() {
  const { readOnly } = useConnectivity();
  const [rows, setRows] = useState<BillingProfilePage | null>(null),
    [page, setPage] = useState(1),
    [edit, setEdit] = useState<BillingProfile | "new" | null>(null),
    [config, setConfig] = useState(fresh),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [uncertain, setUncertain] = useState(false);
  const pending = useRef<{
    id: string;
    requestKey: string;
    expectedVersion: number;
    config: BillingProfileConfig;
  } | null>(null);
  const load = async (p = page) => {
    const data = await accountRequest<BillingProfilePage>(
      "/api/sales/billing-profiles?page=" + p,
    );
    setRows(data);
  };
  useEffect(() => {
    void load(page).catch((e) => setError((e as Error).message));
  }, [page]);
  const disabled = busy || readOnly || uncertain;
  const patch = (data: Partial<BillingProfileConfig>) =>
    setConfig((v) => ({ ...v, ...data }));
  const rule = (kind: string, data: Partial<TaxRule>) =>
    patch({
      rules: config.rules.map((r) => (r.kind === kind ? { ...r, ...data } : r)),
    });
  const begin = (row: BillingProfile | "new") => {
    setEdit(row);
    setConfig(row === "new" ? fresh() : structuredClone(row.config));
    setError("");
    setNotice("");
    setUncertain(false);
    pending.current = null;
  };
  return (
    <section class="settings-card billing-profile-settings">
      <h3>Billing profiles</h3>
      <p class="workspace-help">
        Set your state tax rates for Commercial and Residential quotes. One Labor
        rule covers technician, apprentice and after-hours labor. Service,
        permits, licensing, subcontractors, fuel and travel distance are not taxed.
      </p>
      {edit !== null && edit !== "new" && edit.requiresReview && (
        <Notice tone="warning">
          Review the current tax categories, then save a new profile version
          before estimating. Earlier review history is retained.
        </Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      {!edit ? (
        <>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
            <Button disabled={busy || readOnly} onClick={() => begin("new")}>
              Add billing profile
            </Button>
            <Button
              disabled={busy || readOnly}
              onClick={async () => {
                setBusy(true);
                setError("");
                setNotice("");
                try {
                  const res = await accountRequest<{ created: number }>("/api/sales/billing-profiles/presets", "POST");
                  setNotice(
                    res.created > 0
                      ? `Added ${res.created} CT & MA tax preset${res.created === 1 ? "" : "s"} (Residential & Commercial).`
                      : "CT & MA Residential and Commercial presets are already installed.",
                  );
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Add CT &amp; MA presets
            </Button>
          </div>
          {rows?.profiles.map((row) => (
            <article class="sales-activity" key={row.id}>
              <strong>{row.config.name}</strong>
              <p>
                {row.config.state} · {row.config.jurisdiction} ·{" "}
                {row.config.segment} · v{row.version} ·{" "}
                {row.requiresReview
                  ? "Needs category review"
                  : row.config.active
                    ? "Active"
                    : "Inactive"}
              </p>
              <small>
                {row.config.effectiveFrom} –{" "}
                {row.config.effectiveTo || "No end date"}
              </small>
              <Button disabled={readOnly} onClick={() => begin(row)}>
                Review / edit
              </Button>
            </article>
          ))}
          {rows && rows.profiles.length === 0 && (
            <p>No reviewed billing profiles yet.</p>
          )}
          <div class="sales-form-actions">
            <Button
              disabled={page === 1 || busy}
              onClick={() => setPage(page - 1)}
            >
              Previous profiles
            </Button>
            <span>Page {page}</span>
            <Button
              disabled={!rows?.hasMore || busy}
              onClick={() => setPage(page + 1)}
            >
              Next profiles
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void load().catch((e) => setError((e as Error).message))
              }
            >
              Reload
            </Button>
          </div>
        </>
      ) : (
        <form
          class="sales-details"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || readOnly) return;
            setBusy(true);
            setError("");
            const command = pending.current ?? {
              id: edit === "new" ? crypto.randomUUID() : edit.id,
              expectedVersion: edit === "new" ? 0 : edit.version,
              requestKey: crypto.randomUUID(),
              config: structuredClone(config),
            };
            pending.current = command;
            let acknowledged = false;
            try {
              const saved = await accountRequest<{ profile: BillingProfile }>(
                "/api/sales/billing-profiles",
                "POST",
                command,
              );
              acknowledged = true;
              pending.current = null;
              setUncertain(false);
              setEdit(null);
              setNotice(
                "Billing profile v" +
                  saved.profile.version +
                  " saved with attributed review history.",
              );
              await load();
            } catch (err) {
              setError((err as Error).message);
              const isClientErr = err instanceof AccountRequestError && typeof err.status === "number" && err.status >= 400 && err.status < 500;
              if (isClientErr) {
                pending.current = null;
                setUncertain(false);
              } else if (!acknowledged) {
                setUncertain(true);
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            <TextField
              label="Profile name"
              value={config.name}
              required
              maxLength={120}
              placeholder="e.g. CT Commercial Tax"
              disabled={disabled}
              onInput={(e) => patch({ name: e.currentTarget.value })}
            />
            <TextField
              label="State code"
              value={config.state}
              required
              pattern="[A-Z]{2}"
              maxLength={2}
              placeholder="CT"
              disabled={disabled}
              onInput={(e) =>
                patch({ state: e.currentTarget.value.toUpperCase() })
              }
            />
            <Select
              label="Work segment"
              value={config.segment}
              disabled={disabled}
              options={[
                { value: "commercial", label: "Commercial" },
                { value: "residential", label: "Residential" },
              ]}
              onValueChange={(v) =>
                patch({ segment: v as BillingProfileConfig["segment"] })
              }
            />
            <TextField
              label="Jurisdiction (optional)"
              value={config.jurisdiction}
              maxLength={200}
              placeholder="e.g. Statewide"
              disabled={disabled}
              onInput={(e) => patch({ jurisdiction: e.currentTarget.value })}
            />
            <TextField
              label="Effective from"
              type="date"
              required
              value={config.effectiveFrom}
              disabled={disabled}
              onInput={(e) => patch({ effectiveFrom: e.currentTarget.value })}
            />
            <TextField
              label="Effective through (optional)"
              type="date"
              value={config.effectiveTo || ""}
              disabled={disabled}
              onInput={(e) =>
                patch({ effectiveTo: e.currentTarget.value || null })
              }
            />
          </div>
          <Checkbox
            label="Active for estimates"
            checked={config.active}
            disabled={disabled}
            onChange={(e) => patch({ active: e.currentTarget.checked })}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
            {config.rules.map((r) => (
              <fieldset class="billing-tax-rule" key={r.kind} disabled={disabled}>
                <legend>{taxLabels[r.kind]}</legend>
                <Select
                  label={taxLabels[r.kind] + " tax treatment"}
                  value={r.treatment}
                  disabled={disabled}
                  options={[
                    { value: "exclusive", label: "Tax added to price" },
                    { value: "inclusive", label: "Tax included in price" },
                    { value: "exempt", label: "Tax exempt (0%)" },
                    { value: "outside_scope", label: "Not taxed (0%)" },
                  ]}
                  onValueChange={(v) =>
                    rule(r.kind, {
                      treatment: v as TaxRule["treatment"],
                      rateBasisPoints: ["exempt", "outside_scope"].includes(v)
                        ? 0
                        : r.rateBasisPoints,
                    })
                  }
                />
                <RateField
                  key={(edit === "new" ? "new" : edit.id) + r.kind + r.treatment}
                  kind={taxLabels[r.kind]}
                  value={r.rateBasisPoints}
                  disabled={
                    disabled || ["exempt", "outside_scope"].includes(r.treatment)
                  }
                  change={(v) => rule(r.kind, { rateBasisPoints: v })}
                />
              </fieldset>
            ))}
          </div>
          {uncertain && (
            <Notice tone="warning">
              The save could not be confirmed. Retry the same request or reload
              profiles to check the current version before editing. Your inputs
              are preserved.
            </Notice>
          )}
          <div class="sales-form-actions">
            <Button type="submit" disabled={busy || readOnly}>
              {busy
                ? "Saving…"
                : uncertain
                  ? "Retry exact save"
                  : "Save reviewed profile"}
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setEdit(null);
                setUncertain(false);
                pending.current = null;
                void load().catch((e) => setError((e as Error).message));
              }}
            >
              Back to profiles
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
