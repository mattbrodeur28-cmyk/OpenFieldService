// Additive v8: a renewal ledger linking an authorized source agreement to a new
// renewal draft. v1–v7 SQL stays unchanged. Renewal status is carried by the linked
// draft's own lifecycle; this ledger records the source relationship and history.
export const renewalSchema = `
CREATE TABLE _agreement_renewals(
  id TEXT PRIMARY KEY,
  source_agreement_id TEXT NOT NULL REFERENCES _agreement_drafts(id) ON DELETE RESTRICT,
  renewal_agreement_id TEXT NOT NULL UNIQUE REFERENCES _agreement_drafts(id) ON DELETE RESTRICT,
  source_version INTEGER NOT NULL,
  actor_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _agreement_renewals_source ON _agreement_renewals(source_agreement_id,created_at,id);
CREATE TRIGGER _agreement_renewals_no_update BEFORE UPDATE ON _agreement_renewals BEGIN SELECT RAISE(ABORT,'AGREEMENT_RENEWAL_IMMUTABLE'); END;
CREATE TRIGGER _agreement_renewals_no_delete BEFORE DELETE ON _agreement_renewals BEGIN SELECT RAISE(ABORT,'AGREEMENT_RENEWAL_IMMUTABLE'); END;
`;

// Additive v12: an optional renewal assignee and reminder, surfaced in history.
export const renewalTaskSchema = `
ALTER TABLE _agreement_renewals ADD COLUMN assignee_id TEXT NOT NULL DEFAULT '';
ALTER TABLE _agreement_renewals ADD COLUMN reminder_at TEXT;
`;
