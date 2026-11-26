// Additive v11: the authoritative accepted document. One per agreement, binding the
// exact accepted offer's PDF hash and acceptance event. v1–v10 SQL stays unchanged.
export const authoritativeSchema = `
CREATE TABLE _agreement_authoritative_documents(
  id TEXT PRIMARY KEY,
  agreement_id TEXT NOT NULL UNIQUE REFERENCES _agreement_drafts(id) ON DELETE RESTRICT,
  offer_id TEXT NOT NULL REFERENCES _agreement_offers(id) ON DELETE RESTRICT,
  acceptance_event_id TEXT NOT NULL REFERENCES _agreement_offer_events(id) ON DELETE RESTRICT,
  pdf_hash TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER _agreement_authoritative_no_update BEFORE UPDATE ON _agreement_authoritative_documents BEGIN SELECT RAISE(ABORT,'AGREEMENT_AUTHORITATIVE_IMMUTABLE'); END;
CREATE TRIGGER _agreement_authoritative_no_delete BEFORE DELETE ON _agreement_authoritative_documents BEGIN SELECT RAISE(ABORT,'AGREEMENT_AUTHORITATIVE_IMMUTABLE'); END;
`;
