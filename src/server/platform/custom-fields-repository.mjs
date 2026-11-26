import { migrate, transaction } from './sqlite.mjs';
import { fail } from './custom-fields-domain.mjs';
const bindings = Object.freeze({
    'crm.customer': { table: 'customers', label: 'name', reference: 'customer_id' },
    'equipment.asset': { table: 'assets', label: 'name', reference: 'asset_id' },
    'sales.opportunity': { table: '_sales_opportunities', label: 'title', reference: 'opportunity_id' },
    'service.job': { table: 'jobs', label: 'identifier', reference: 'job_id' }
});
const sql = `
CREATE TABLE _platform_custom_fields(id TEXT PRIMARY KEY,object_key TEXT NOT NULL,field_key TEXT NOT NULL,field_type TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),active INTEGER NOT NULL CHECK(active IN(0,1)),UNIQUE(object_key,field_key),UNIQUE(id,object_key));
CREATE TABLE _platform_custom_field_revisions(field_id TEXT NOT NULL REFERENCES _platform_custom_fields(id) ON DELETE RESTRICT,version INTEGER NOT NULL CHECK(version>0),definition_json TEXT NOT NULL CHECK(json_valid(definition_json)),actor_id TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(field_id,version));
CREATE TABLE _platform_custom_records(object_key TEXT NOT NULL,native_id TEXT NOT NULL,customer_id TEXT REFERENCES customers(id) ON DELETE RESTRICT,asset_id TEXT REFERENCES assets(id) ON DELETE RESTRICT,opportunity_id TEXT REFERENCES _sales_opportunities(id) ON DELETE RESTRICT,job_id TEXT REFERENCES jobs(id) ON DELETE RESTRICT,version INTEGER NOT NULL CHECK(version>=0),PRIMARY KEY(object_key,native_id),CHECK((object_key='crm.customer' AND customer_id IS native_id AND asset_id IS NULL AND opportunity_id IS NULL AND job_id IS NULL) OR (object_key='equipment.asset' AND asset_id IS native_id AND customer_id IS NULL AND opportunity_id IS NULL AND job_id IS NULL) OR (object_key='sales.opportunity' AND opportunity_id IS native_id AND customer_id IS NULL AND asset_id IS NULL AND job_id IS NULL) OR (object_key='service.job' AND job_id IS native_id AND customer_id IS NULL AND asset_id IS NULL AND opportunity_id IS NULL)));
CREATE TABLE _platform_custom_values(object_key TEXT NOT NULL,native_id TEXT NOT NULL,field_id TEXT NOT NULL,field_version INTEGER NOT NULL,value_json TEXT NOT NULL CHECK(json_valid(value_json)),PRIMARY KEY(object_key,native_id,field_id),FOREIGN KEY(object_key,native_id) REFERENCES _platform_custom_records(object_key,native_id) ON DELETE RESTRICT,FOREIGN KEY(field_id,object_key) REFERENCES _platform_custom_fields(id,object_key) ON DELETE RESTRICT,FOREIGN KEY(field_id,field_version) REFERENCES _platform_custom_field_revisions(field_id,version) ON DELETE RESTRICT);
CREATE TABLE _platform_custom_value_events(id TEXT PRIMARY KEY,object_key TEXT NOT NULL,native_id TEXT NOT NULL,record_version INTEGER NOT NULL,changes_json TEXT NOT NULL CHECK(json_valid(changes_json)),actor_id TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(object_key,native_id,record_version),FOREIGN KEY(object_key,native_id) REFERENCES _platform_custom_records(object_key,native_id) ON DELETE RESTRICT);
CREATE TABLE _platform_custom_requests(request_key TEXT PRIMARY KEY,actor_id TEXT NOT NULL,request_hash TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX _platform_custom_field_objects ON _platform_custom_fields(object_key,active,field_key);
CREATE INDEX _platform_custom_record_events ON _platform_custom_value_events(object_key,native_id,record_version);
${['_platform_custom_field_revisions', '_platform_custom_value_events', '_platform_custom_requests'].flatMap(t => ['UPDATE', 'DELETE'].map(action => `CREATE TRIGGER ${t}_${action.toLowerCase()} BEFORE ${action} ON ${t} BEGIN SELECT RAISE(ABORT,'PLATFORM_CUSTOM_HISTORY_IMMUTABLE'); END;`)).join(' ')}
CREATE TRIGGER _platform_custom_field_identity BEFORE UPDATE OF id,object_key,field_key,field_type ON _platform_custom_fields WHEN NEW.id IS NOT OLD.id OR NEW.object_key IS NOT OLD.object_key OR NEW.field_key IS NOT OLD.field_key OR NEW.field_type IS NOT OLD.field_type BEGIN SELECT RAISE(ABORT,'PLATFORM_CUSTOM_FIELD_IDENTITY'); END;
`;
export function createCustomFieldRepository(storage) {
    const db = storage.database;
    for (const { table } of Object.values(bindings))
        if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))
            throw new Error('Initialize native business modules before custom fields.');
    migrate(db, '_platform_custom_field_migrations', [{ version: 1, sql }]);
    const shape = row => row ? { ...JSON.parse(row.definition_json), version: row.version } : null;
    const field = id => shape(db.prepare('SELECT r.definition_json,f.version FROM _platform_custom_fields f JOIN _platform_custom_field_revisions r ON r.field_id=f.id AND r.version=f.version WHERE f.id=?').get(id));
    return {
        within: work => transaction(db, work),
        native(objectKey, id) { const b = bindings[objectKey]; if (!b)
            fail('This object has no custom-field adapter.', 422); const row = db.prepare(`SELECT id,${b.label} AS label FROM ${b.table} WHERE id=?`).get(id); if (!row)
            fail('Native record not found.', 404); return row; },
        field,
        fields: key => db.prepare('SELECT r.definition_json,f.version FROM _platform_custom_fields f JOIN _platform_custom_field_revisions r ON r.field_id=f.id AND r.version=f.version WHERE f.object_key=? ORDER BY f.field_key,f.id').all(key).map(shape),
        namedField: (key, name) => db.prepare('SELECT id FROM _platform_custom_fields WHERE object_key=? AND field_key=?').get(key, name),
        saveField(definition, user, reason) {
            db.prepare('INSERT INTO _platform_custom_fields(id,object_key,field_key,field_type,version,active) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,active=excluded.active').run(definition.id, definition.objectKey, definition.key, definition.type, definition.version, Number(definition.active));
            db.prepare('INSERT INTO _platform_custom_field_revisions(field_id,version,definition_json,actor_id,reason) VALUES(?,?,?,?,?)').run(definition.id, definition.version, JSON.stringify(definition), user.id, reason);
        },
        record: (key, id) => db.prepare('SELECT version FROM _platform_custom_records WHERE object_key=? AND native_id=?').get(key, id),
        values: (key, id) => db.prepare('SELECT field_id AS fieldId,field_version AS fieldVersion,value_json FROM _platform_custom_values WHERE object_key=? AND native_id=?').all(key, id).map(({ value_json, ...row }) => ({ ...row, value: JSON.parse(value_json) })),
        saveValues(key, id, recordVersion, changes, event, user, reason) {
            const b = bindings[key];
            db.prepare(`INSERT OR IGNORE INTO _platform_custom_records(object_key,native_id,${b.reference},version) VALUES(?,?,?,0)`).run(key, id, id);
            for (const c of changes)
                db.prepare('INSERT INTO _platform_custom_values(object_key,native_id,field_id,field_version,value_json) VALUES(?,?,?,?,?) ON CONFLICT(object_key,native_id,field_id) DO UPDATE SET field_version=excluded.field_version,value_json=excluded.value_json').run(key, id, c.fieldId, c.fieldVersion, JSON.stringify(c.after));
            db.prepare('UPDATE _platform_custom_records SET version=? WHERE object_key=? AND native_id=?').run(recordVersion, key, id);
            db.prepare('INSERT INTO _platform_custom_value_events(id,object_key,native_id,record_version,changes_json,actor_id,reason) VALUES(?,?,?,?,?,?,?)').run(event, key, id, recordVersion, JSON.stringify(changes), user.id, reason);
        },
        eventExists: id => !!db.prepare("SELECT 1 FROM _platform_custom_value_events WHERE id=?").get(id),
        prior: key => db.prepare('SELECT * FROM _platform_custom_requests WHERE request_key=?').get(key),
        acknowledge: (key, user, hash, result) => db.prepare('INSERT INTO _platform_custom_requests(request_key,actor_id,request_hash,result_json) VALUES(?,?,?,?)').run(key, user.id, hash, JSON.stringify(result)),
        fieldHistory: (id, page) => db.prepare('SELECT version,definition_json,actor_id AS actorId,reason,created_at AS createdAt FROM _platform_custom_field_revisions WHERE field_id=? ORDER BY version DESC LIMIT 26 OFFSET ?').all(id, (page - 1) * 25).map(({ definition_json, ...row }) => ({ ...row, definition: JSON.parse(definition_json) })),
        recordHistory: (key, id, page) => db.prepare('SELECT id,record_version AS version,changes_json,actor_id AS actorId,reason,created_at AS createdAt FROM _platform_custom_value_events WHERE object_key=? AND native_id=? ORDER BY record_version DESC LIMIT 26 OFFSET ?').all(key, id, (page - 1) * 25).map(({ changes_json, ...row }) => ({ ...row, changes: JSON.parse(changes_json) }))
    };
}
export const customFieldObjectKeys = Object.freeze(Object.keys(bindings));
