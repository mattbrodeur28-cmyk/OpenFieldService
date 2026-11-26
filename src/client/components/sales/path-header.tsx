import type { Opportunity, SalesPipeline } from "../../sales-types";
import { Check } from "lucide-preact";

// Salesforce "Path": a read-only stage-progression strip. Stage moves use the existing
// MoveForm (which enforces allowed transitions and reasons); this shows where the
// opportunity is in the process.
export function PathHeader({
  opportunity,
  pipeline,
}: {
  opportunity: Opportunity;
  pipeline: SalesPipeline;
}) {
  const stages = pipeline.stages;
  const currentIndex = stages.findIndex((s) => s.id === opportunity.stage_id);
  return (
    <div class="sales-path" role="navigation" aria-label="Opportunity stage path">
      {stages.map((stage, index) => {
        const state =
          index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";
        return (
          <div class={"sales-path-step is-" + state} key={stage.id}>
            <span class="sales-path-marker">
              {state === "complete" ? <Check size={12} /> : index + 1}
            </span>
            <span class="sales-path-label">{stage.name}</span>
            {index < stages.length - 1 && <span class="sales-path-connector" aria-hidden="true" />}
          </div>
        );
      })}
    </div>
  );
}
