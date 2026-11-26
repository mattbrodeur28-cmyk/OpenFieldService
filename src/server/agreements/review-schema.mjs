// Additive v2; never change applied draft migration v1.
export const reviewSchema = `
CREATE TABLE _agreement_draft_reviews(id TEXT PRIMARY KEY,agreement_id TEXT NOT NULL,version INTEGER NOT NULL,sequence INTEGER NOT NULL CHECK(sequence>0),action TEXT NOT NULL CHECK(action IN('submit','approve','reject','withdraw')),status TEXT NOT NULL CHECK(status IN('submitted','approved','rejected','withdrawn')),source_hash TEXT NOT NULL,context_json TEXT NOT NULL CHECK(json_valid(context_json)),actor_id TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(agreement_id,version,sequence),FOREIGN KEY(agreement_id,version) REFERENCES _agreement_draft_revisions(agreement_id,version) ON DELETE RESTRICT);
CREATE INDEX _agreement_review_version ON _agreement_draft_reviews(agreement_id,version,sequence);
CREATE TRIGGER _agreement_review_no_update BEFORE UPDATE ON _agreement_draft_reviews BEGIN SELECT RAISE(ABORT,'AGREEMENT_REVIEW_IMMUTABLE'); END;
CREATE TRIGGER _agreement_review_no_delete BEFORE DELETE ON _agreement_draft_reviews BEGIN SELECT RAISE(ABORT,'AGREEMENT_REVIEW_IMMUTABLE'); END;
`;
