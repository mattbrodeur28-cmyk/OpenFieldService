// Additive v3: immutable proposed PDF per draft revision, never acceptance evidence.
export const documentSchema = `
CREATE TABLE _agreement_proposed_documents(id TEXT PRIMARY KEY,agreement_id TEXT NOT NULL,version INTEGER NOT NULL,blob_id TEXT NOT NULL REFERENCES _document_blobs(id) ON DELETE RESTRICT,title TEXT NOT NULL,original_name TEXT NOT NULL,actor_id TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(agreement_id,version),FOREIGN KEY(agreement_id,version) REFERENCES _agreement_draft_revisions(agreement_id,version) ON DELETE RESTRICT);
CREATE TRIGGER _agreement_document_no_update BEFORE UPDATE ON _agreement_proposed_documents BEGIN SELECT RAISE(ABORT,'AGREEMENT_DOCUMENT_IMMUTABLE'); END;
CREATE TRIGGER _agreement_document_no_delete BEFORE DELETE ON _agreement_proposed_documents BEGIN SELECT RAISE(ABORT,'AGREEMENT_DOCUMENT_IMMUTABLE'); END;
`;
