import { migrate } from "../platform/sqlite.mjs";
const sql = `
CREATE TABLE _sales_settings(id INTEGER PRIMARY KEY CHECK(id=1),currency TEXT NOT NULL DEFAULT 'USD');
INSERT INTO _sales_settings(id) VALUES(1);
CREATE TABLE _sales_pipelines(id TEXT PRIMARY KEY,name TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE _sales_stages(id TEXT PRIMARY KEY,pipeline_id TEXT NOT NULL REFERENCES _sales_pipelines(id),name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('open','won','lost')),position INTEGER NOT NULL,probability INTEGER NOT NULL CHECK(probability BETWEEN 0 AND 100),required_fields TEXT NOT NULL DEFAULT '[]',allowed_from TEXT NOT NULL DEFAULT '[]',active INTEGER NOT NULL DEFAULT 1);
CREATE INDEX _sales_stages_pipeline ON _sales_stages(pipeline_id,active,position);
CREATE TABLE _sales_opportunities(id TEXT PRIMARY KEY,title TEXT NOT NULL,pipeline_id TEXT NOT NULL REFERENCES _sales_pipelines(id),stage_id TEXT NOT NULL REFERENCES _sales_stages(id),owner_id TEXT NOT NULL,prospect_name TEXT NOT NULL DEFAULT '',contact_name TEXT NOT NULL DEFAULT '',contact_email TEXT NOT NULL DEFAULT '',contact_phone TEXT NOT NULL DEFAULT '',segment TEXT NOT NULL CHECK(segment IN ('commercial','residential')),source TEXT NOT NULL DEFAULT '',expected_value INTEGER NOT NULL CHECK(expected_value BETWEEN 0 AND 1000000000),probability INTEGER NOT NULL CHECK(probability BETWEEN 0 AND 100),expected_close_date TEXT NOT NULL DEFAULT '',next_action TEXT NOT NULL DEFAULT '',next_action_date TEXT NOT NULL DEFAULT '',customer_id TEXT REFERENCES customers(id) ON DELETE RESTRICT,site_id TEXT REFERENCES sites(id) ON DELETE RESTRICT,asset_id TEXT REFERENCES assets(id) ON DELETE RESTRICT,notes TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX _sales_opportunities_board ON _sales_opportunities(pipeline_id,stage_id,owner_id,expected_close_date);
CREATE TABLE _sales_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,reason TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX _sales_audit_entity ON _sales_audit(entity_type,entity_id,id);
CREATE TABLE _sales_notes(id TEXT PRIMARY KEY,opportunity_id TEXT NOT NULL REFERENCES _sales_opportunities(id) ON DELETE RESTRICT,actor_id TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX _sales_notes_opportunity ON _sales_notes(opportunity_id,created_at);
`;
export function installSales(db) {
  migrate(db, "_sales_schema_migrations", [{ version: 1, sql }]);
}
export const projection = `SELECT o.*,c.name AS customer_name,s.name AS stage_name,s.kind AS stage_kind,p.name AS pipeline_name FROM _sales_opportunities o JOIN _sales_stages s ON s.id=o.stage_id JOIN _sales_pipelines p ON p.id=o.pipeline_id LEFT JOIN customers c ON c.id=o.customer_id`;
export function audit(db, user, type, id, action, before, after, reason = "") {
  db.prepare(
    "INSERT INTO _sales_audit(entity_type,entity_id,actor_id,action,before_json,after_json,reason) VALUES(?,?,?,?,?,?,?)",
  ).run(
    type,
    id,
    user.id,
    action,
    JSON.stringify(before),
    JSON.stringify(after),
    reason,
  );
}
