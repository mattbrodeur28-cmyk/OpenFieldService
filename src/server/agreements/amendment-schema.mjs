// Additive v10: an amendment ledger linking an accepted source agreement to a new
// amendment draft. v1–v9 SQL stays unchanged. Amendment status follows the linked
// draft's own lifecycle; this ledger retains the source relationship and history.
export const amendmentSchema = `
CREATE TABLE _agreement_amendments(
  id TEXT PRIMARY KEY,
  source_agreement_id TEXT NOT NULL REFERENCES _agreement_drafts(id) ON DELETE RESTRICT,
  amendment_agreement_id TEXT NOT NULL UNIQUE REFERENCES _agreement_drafts(id) ON DELETE RESTRICT,
  source_version INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('scope','price','terms','other')),
  actor_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _agreement_amendments_source ON _agreement_amendments(source_agreement_id,created_at,id);
CREATE TRIGGER _agreement_amendments_no_update BEFORE UPDATE ON _agreement_amendments BEGIN SELECT RAISE(ABORT,'AGREEMENT_AMENDMENT_IMMUTABLE'); END;
CREATE TRIGGER _agreement_amendments_no_delete BEFORE DELETE ON _agreement_amendments BEGIN SELECT RAISE(ABORT,'AGREEMENT_AMENDMENT_IMMUTABLE'); END;
`;
