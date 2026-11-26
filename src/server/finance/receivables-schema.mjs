// Additive finance v2. Do not change applied receipt/reference migration v1.
export const receivablesSchema=`
CREATE TABLE _finance_collection_notes(id TEXT PRIMARY KEY,invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,actor_id TEXT NOT NULL,content TEXT NOT NULL,follow_up_on TEXT NOT NULL,context_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX _finance_collections_invoice ON _finance_collection_notes(invoice_id,created_at,id);
CREATE TRIGGER _finance_collections_update BEFORE UPDATE ON _finance_collection_notes BEGIN SELECT RAISE(ABORT,'FINANCE_IMMUTABLE'); END;
CREATE TRIGGER _finance_collections_delete BEFORE DELETE ON _finance_collection_notes BEGIN SELECT RAISE(ABORT,'FINANCE_IMMUTABLE'); END;
`;
