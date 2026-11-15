// Additive quote-draft schema. Never edit once applied; add a new migration instead.
export const quoteSchema = `
CREATE TABLE _sales_quotes(id TEXT PRIMARY KEY,number INTEGER NOT NULL UNIQUE CHECK(number>0),opportunity_id TEXT NOT NULL REFERENCES _sales_opportunities(id) ON DELETE RESTRICT,version INTEGER NOT NULL CHECK(version>0),status TEXT NOT NULL CHECK(status IN ('draft','offered','accepted','declined','expired','void')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX _sales_quotes_opportunity ON _sales_quotes(opportunity_id,updated_at,id);
CREATE TABLE _sales_quote_revisions(quote_id TEXT NOT NULL REFERENCES _sales_quotes(id) ON DELETE RESTRICT,version INTEGER NOT NULL CHECK(version>0),actor_id TEXT NOT NULL,document_json TEXT NOT NULL,pricing_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(quote_id,version));
CREATE TABLE _sales_quote_revision_lines(quote_id TEXT NOT NULL,version INTEGER NOT NULL,line_id TEXT NOT NULL,position INTEGER NOT NULL,material_id TEXT REFERENCES materials(id) ON DELETE RESTRICT,line_json TEXT NOT NULL,PRIMARY KEY(quote_id,version,line_id),FOREIGN KEY(quote_id,version) REFERENCES _sales_quote_revisions(quote_id,version) ON DELETE RESTRICT);
CREATE INDEX _sales_quote_materials ON _sales_quote_revision_lines(material_id,quote_id,version);
CREATE TABLE _sales_quote_requests(request_key TEXT PRIMARY KEY,actor_id TEXT NOT NULL,request_hash TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TRIGGER _sales_quote_revisions_update BEFORE UPDATE ON _sales_quote_revisions BEGIN SELECT RAISE(ABORT,'QUOTE_IMMUTABLE'); END;
CREATE TRIGGER _sales_quote_revisions_delete BEFORE DELETE ON _sales_quote_revisions BEGIN SELECT RAISE(ABORT,'QUOTE_IMMUTABLE'); END;
CREATE TRIGGER _sales_quote_lines_update BEFORE UPDATE ON _sales_quote_revision_lines BEGIN SELECT RAISE(ABORT,'QUOTE_IMMUTABLE'); END;
CREATE TRIGGER _sales_quote_lines_delete BEFORE DELETE ON _sales_quote_revision_lines BEGIN SELECT RAISE(ABORT,'QUOTE_IMMUTABLE'); END;
CREATE TRIGGER _sales_quote_requests_update BEFORE UPDATE ON _sales_quote_requests BEGIN SELECT RAISE(ABORT,'QUOTE_IMMUTABLE'); END;
CREATE TRIGGER _sales_quote_requests_delete BEFORE DELETE ON _sales_quote_requests BEGIN SELECT RAISE(ABORT,'QUOTE_IMMUTABLE'); END;
`;
