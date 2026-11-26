// Version 3 is additive: an immutable ledger of won/lost/reopen stage outcomes with
// the loss reason and competitor retained for reopen history. Never edit v1/v2 SQL.
export const outcomeSchema = `
CREATE TABLE _sales_stage_outcomes(
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES _sales_opportunities(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK(kind IN ('won','lost','reopen')),
  stage_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  competitor TEXT NOT NULL DEFAULT '',
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _sales_outcomes_opportunity ON _sales_stage_outcomes(opportunity_id,created_at,id);
CREATE TRIGGER _sales_outcomes_update BEFORE UPDATE ON _sales_stage_outcomes BEGIN SELECT RAISE(ABORT,'SALES_OUTCOME_IMMUTABLE'); END;
CREATE TRIGGER _sales_outcomes_delete BEFORE DELETE ON _sales_stage_outcomes BEGIN SELECT RAISE(ABORT,'SALES_OUTCOME_IMMUTABLE'); END;
`;
