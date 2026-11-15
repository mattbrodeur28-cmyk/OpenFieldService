import { useState } from "preact/hooks";
import type { Opportunity, SalesPipeline } from "../../sales-types";
import { Button } from "../ui/button";
import { TextField } from "../ui/input";
import { Select } from "../ui/select";
export function MoveForm({
  opportunity,
  pipeline,
  target,
  disabled,
  move,
}: {
  opportunity: Opportunity;
  pipeline: SalesPipeline;
  target?: string;
  disabled: boolean;
  move(row: Opportunity, stageId: string, reason: string): Promise<boolean>;
}) {
  const [stageId, setStageId] = useState(target || opportunity.stage_id),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  const stage = pipeline.stages.find((item) => item.id === stageId),
    needsReason = stage?.kind === "lost" || opportunity.stage_kind === "lost";
  return (
    <form
      class="sales-form sales-move-form"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void move(opportunity, stageId, reason).finally(() => setBusy(false));
      }}
    >
      <Select
        label="Move to stage"
        value={stageId}
        onValueChange={setStageId}
        disabled={busy || disabled}
        options={pipeline.stages.map((item) => ({
          value: item.id,
          label:
            item.name +
            (item.kind === "won" ? " · quote conversion required" : ""),
          disabled: item.kind === "won",
        }))}
      />
      {needsReason && (
        <TextField
          label={stage?.kind === "lost" ? "Loss reason" : "Reopen reason"}
          value={reason}
          onInput={(e) => setReason(e.currentTarget.value)}
          required
          minLength={3}
          maxLength={1000}
          disabled={busy || disabled}
        />
      )}
      <Button
        type="submit"
        disabled={
          busy ||
          disabled ||
          stageId === opportunity.stage_id ||
          stage?.kind === "won"
        }
      >
        {busy ? "Moving…" : "Move stage"}
      </Button>
    </form>
  );
}
