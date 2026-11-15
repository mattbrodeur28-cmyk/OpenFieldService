import { useState } from "preact/hooks";
import { Plus, X, ArrowUp, ArrowDown } from "lucide-preact";
import type { SalesStage, SalesPipeline } from "../../sales-types";
import { Button } from "../ui/button";
import { TextField } from "../ui/input";
import { DialogTitle } from "../ui/dialog";
import { Badge, Notice, Sheet, Checkbox } from "../ui/surfaces";
const defaultStages = (): SalesStage[] =>
  [
    { name: "New", kind: "open", probability: 10 },
    { name: "Won", kind: "won", probability: 100 },
    { name: "Lost", kind: "lost", probability: 0 },
  ].map(
    (stage) =>
      ({
        ...stage,
        id: crypto.randomUUID(),
        requiredFields: [],
        allowedFrom: [],
      }) as SalesStage,
  );
const fields = [
  { value: "customerId", label: "Linked customer" },
  { value: "expectedCloseDate", label: "Expected close date" },
  { value: "expectedValue", label: "Positive expected value" },
  { value: "nextAction", label: "Next action" },
];

export function PipelineEditor({
  pipeline,
  close,
  commit,
  disabled,
  serverError,
}: {
  pipeline: SalesPipeline | null;
  close(): void;
  commit(data: unknown, id?: string): Promise<boolean>;
  disabled: boolean;
  serverError: string;
}) {
  const [name, setName] = useState(pipeline?.name || ""),
    [stages, setStages] = useState<SalesStage[]>(
      pipeline?.stages || defaultStages(),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const update = (id: string, data: Partial<SalesStage>) =>
    setStages(
      stages.map((stage) => (stage.id === id ? { ...stage, ...data } : stage)),
    );
  const reorder = (index: number, delta: number) => {
    const next = [...stages];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setStages(next);
  };
  return (
    <Sheet close={close}>
      <header class="sales-sheet-header">
        <DialogTitle>
          {pipeline ? "Configure pipeline" : "New pipeline"}
        </DialogTitle>
        <Button
          size="icon"
          aria-label="Close pipeline configuration"
          onClick={close}
        >
          <X size={18} />
        </Button>
      </header>
      <p class="workspace-help">
        Stages describe Sales progress. Won is reserved for accepted quote
        conversion. Changes apply to the whole company.
      </p>
      {(serverError || error) && (
        <Notice tone="danger">{serverError || error}</Notice>
      )}
      <form
        class="sales-form"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          void commit(
            {
              name,
              stages: stages.map(
                ({
                  id,
                  name,
                  kind,
                  probability,
                  requiredFields,
                  allowedFrom,
                }) => ({
                  id,
                  name,
                  kind,
                  probability,
                  requiredFields,
                  allowedFrom,
                }),
              ),
              ...(pipeline ? { expectedVersion: pipeline.version } : {}),
            },
            pipeline?.id,
          )
            .then((ok) => {
              if (ok) close();
              else
                setError(
                  "Pipeline was not saved. Review the error on the board; reopen this editor if its version changed.",
                );
            })
            .finally(() => setBusy(false));
        }}
      >
        <TextField
          label="Pipeline name"
          value={name}
          onInput={(e) => setName(e.currentTarget.value)}
          required
          maxLength={100}
          disabled={busy || disabled}
        />
        {stages.map((stage, index) => (
          <section class="sales-stage-editor" key={stage.id}>
            <div class="sales-stage-editor-header">
              <Badge>{index + 1}</Badge>
              <strong>{stage.name || "New stage"}</strong>
              <Button
                size="icon"
                aria-label={"Move " + stage.name + " earlier"}
                disabled={busy || disabled || index === 0}
                onClick={() => reorder(index, -1)}
              >
                <ArrowUp size={15} />
              </Button>
              <Button
                size="icon"
                aria-label={"Move " + stage.name + " later"}
                disabled={busy || disabled || index === stages.length - 1}
                onClick={() => reorder(index, 1)}
              >
                <ArrowDown size={15} />
              </Button>
            </div>
            <div class="sales-form-grid">
              <TextField
                label="Stage name"
                required
                value={stage.name}
                maxLength={80}
                disabled={busy || disabled}
                onInput={(e) =>
                  update(stage.id, { name: e.currentTarget.value })
                }
              />
              <TextField
                label="Default probability (%)"
                type="number"
                min={0}
                max={100}
                required
                value={stage.probability}
                disabled={busy || disabled || stage.kind !== "open"}
                onInput={(e) =>
                  update(stage.id, {
                    probability: Number(e.currentTarget.value),
                  })
                }
              />
            </div>
            <small class="workspace-help">
              {stage.kind === "open"
                ? "Open work"
                : stage.kind === "won"
                  ? "Won · requires quote conversion"
                  : "Lost · reason required"}
            </small>
            {stage.kind === "open" && (
              <details>
                <summary>Stage requirements and transitions</summary>
                <div class="sales-checks">
                  {fields.map((field) => (
                    <Checkbox
                      key={field.value}
                      label={"Require " + field.label.toLowerCase()}
                      checked={stage.requiredFields.includes(field.value)}
                      disabled={busy || disabled}
                      onChange={(e) =>
                        update(stage.id, {
                          requiredFields: e.currentTarget.checked
                            ? [...stage.requiredFields, field.value]
                            : stage.requiredFields.filter(
                                (v) => v !== field.value,
                              ),
                        })
                      }
                    />
                  ))}
                </div>
                <p class="workspace-help">
                  Allowed previous stages: leave all unchecked to allow any
                  stage. Reopening Lost still requires an administrator and
                  reason.
                </p>
                <div class="sales-checks">
                  {stages
                    .filter((item) => item.id !== stage.id)
                    .map((item) => (
                      <Checkbox
                        key={item.id}
                        label={item.name || "Unnamed stage"}
                        checked={stage.allowedFrom.includes(item.id)}
                        disabled={busy || disabled}
                        onChange={(e) =>
                          update(stage.id, {
                            allowedFrom: e.currentTarget.checked
                              ? [...stage.allowedFrom, item.id]
                              : stage.allowedFrom.filter((v) => v !== item.id),
                          })
                        }
                      />
                    ))}
                </div>
                <Button
                  variant="ghost"
                  disabled={busy || disabled}
                  onClick={() =>
                    setStages(
                      stages
                        .filter((item) => item.id !== stage.id)
                        .map((item) => ({
                          ...item,
                          allowedFrom: item.allowedFrom.filter(
                            (id) => id !== stage.id,
                          ),
                        })),
                    )
                  }
                >
                  Remove stage
                </Button>
              </details>
            )}
          </section>
        ))}
        <Button
          disabled={busy || disabled || stages.length >= 20}
          onClick={() =>
            setStages([
              ...stages,
              {
                id: crypto.randomUUID(),
                name: "",
                kind: "open",
                probability: 50,
                requiredFields: [],
                allowedFrom: [],
              },
            ])
          }
        >
          <Plus size={15} /> Add stage
        </Button>
        <Button type="submit" variant="primary" disabled={busy || disabled}>
          {busy ? "Saving…" : "Save pipeline"}
        </Button>
      </form>
    </Sheet>
  );
}
