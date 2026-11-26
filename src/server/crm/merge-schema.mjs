// CRM-006 merge policy: reviewed duplicate merge. Adds v6 (an immutable merge ledger)
// and a command that remaps the source customer's live references onto a surviving
// target, marks the source inactive, and retains both rows for history.
export const mergeSchema = `
CREATE TABLE _crm_merges(
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER _crm_merges_no_update BEFORE UPDATE ON _crm_merges BEGIN SELECT RAISE(ABORT,'CRM_MERGE_IMMUTABLE'); END;
CREATE TRIGGER _crm_merges_no_delete BEFORE DELETE ON _crm_merges BEGIN SELECT RAISE(ABORT,'CRM_MERGE_IMMUTABLE'); END;
`;
