// Additive quote migration v3. Applied v1/v2 migrations remain unchanged.
export const quoteReviewSchema = `
CREATE TABLE _sales_quote_review_policy(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL CHECK(version>0),config_json TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE _sales_quote_review_policy_revisions(version INTEGER PRIMARY KEY CHECK(version>0),actor_id TEXT NOT NULL,config_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE _sales_quote_review_policy_requests(request_key TEXT PRIMARY KEY,actor_id TEXT NOT NULL,request_hash TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE _sales_quote_review_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,quote_id TEXT NOT NULL,quote_version INTEGER NOT NULL,policy_version INTEGER NOT NULL REFERENCES _sales_quote_review_policy_revisions(version) ON DELETE RESTRICT,evaluation_version INTEGER NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL CHECK(action IN ('approve','revoke')),previous_event_id TEXT REFERENCES _sales_quote_review_events(id) ON DELETE RESTRICT,note TEXT NOT NULL,flags_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(quote_id,quote_version) REFERENCES _sales_quote_revisions(quote_id,version) ON DELETE RESTRICT);
CREATE INDEX _sales_quote_reviews_quote ON _sales_quote_review_events(quote_id,quote_version,sequence);
CREATE TABLE _sales_quote_review_requests(request_key TEXT PRIMARY KEY,actor_id TEXT NOT NULL,request_hash TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TRIGGER _sales_quote_review_policy_revisions_update BEFORE UPDATE ON _sales_quote_review_policy_revisions BEGIN SELECT RAISE(ABORT,'QUOTE_REVIEW_IMMUTABLE'); END;
CREATE TRIGGER _sales_quote_review_policy_revisions_delete BEFORE DELETE ON _sales_quote_review_policy_revisions BEGIN SELECT RAISE(ABORT,'QUOTE_REVIEW_IMMUTABLE'); END;
CREATE TRIGGER _sales_quote_review_policy_requests_update BEFORE UPDATE ON _sales_quote_review_policy_requests BEGIN SELECT RAISE(ABORT,'QUOTE_REVIEW_IMMUTABLE'); END;
CREATE TRIGGER _sales_quote_review_policy_requests_delete BEFORE DELETE ON _sales_quote_review_policy_requests BEGIN SELECT RAISE(ABORT,'QUOTE_REVIEW_IMMUTABLE'); END;
CREATE TRIGGER _sales_quote_review_events_update BEFORE UPDATE ON _sales_quote_review_events BEGIN SELECT RAISE(ABORT,'QUOTE_REVIEW_IMMUTABLE'); END;
CREATE TRIGGER _sales_quote_review_events_delete BEFORE DELETE ON _sales_quote_review_events BEGIN SELECT RAISE(ABORT,'QUOTE_REVIEW_IMMUTABLE'); END;
CREATE TRIGGER _sales_quote_review_requests_update BEFORE UPDATE ON _sales_quote_review_requests BEGIN SELECT RAISE(ABORT,'QUOTE_REVIEW_IMMUTABLE'); END;
CREATE TRIGGER _sales_quote_review_requests_delete BEFORE DELETE ON _sales_quote_review_requests BEGIN SELECT RAISE(ABORT,'QUOTE_REVIEW_IMMUTABLE'); END;
`;
