// Additive v5; applied quote migrations remain byte-for-byte unchanged.
export const quoteConversionSchema = `
CREATE TABLE _sales_quote_conversions(
 id TEXT PRIMARY KEY,
 quote_id TEXT NOT NULL UNIQUE REFERENCES _sales_quotes(id) ON DELETE RESTRICT,
 quote_version INTEGER NOT NULL,
 opportunity_id TEXT NOT NULL UNIQUE REFERENCES _sales_opportunities(id) ON DELETE RESTRICT,
 offer_id TEXT NOT NULL UNIQUE REFERENCES _sales_quote_offers(id) ON DELETE RESTRICT,
 acceptance_event_id TEXT NOT NULL UNIQUE REFERENCES _sales_quote_lifecycle_events(id) ON DELETE RESTRICT,
 job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE RESTRICT,
 actor_id TEXT NOT NULL,mapping_note TEXT NOT NULL,won_reason TEXT NOT NULL,
 document_hash TEXT NOT NULL,html_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(quote_id,quote_version) REFERENCES _sales_quote_revisions(quote_id,version) ON DELETE RESTRICT
);
CREATE TABLE _sales_quote_conversion_requests(request_key TEXT PRIMARY KEY,actor_id TEXT NOT NULL,request_hash TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE _sales_quote_conversion_events(id TEXT PRIMARY KEY,conversion_id TEXT NOT NULL REFERENCES _sales_quote_conversions(id) ON DELETE RESTRICT,actor_id TEXT NOT NULL,action TEXT NOT NULL CHECK(action='cancel_job'),note TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
${['_sales_quote_conversions','_sales_quote_conversion_requests','_sales_quote_conversion_events'].flatMap(table=>['UPDATE','DELETE'].map(action=>`CREATE TRIGGER ${table}_${action.toLowerCase()} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'QUOTE_CONVERSION_IMMUTABLE'); END;`)).join('\n')}
`;
