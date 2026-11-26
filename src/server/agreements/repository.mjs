import { reviewSchema } from "./review-schema.mjs";
import { migrate, transaction } from '../platform/sqlite.mjs';
import { fail } from './domain.mjs';
const sql = `
CREATE TABLE _agreement_drafts(id TEXT PRIMARY KEY,number INTEGER NOT NULL UNIQUE CHECK(number>0),customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,version INTEGER NOT NULL CHECK(version>0),title TEXT NOT NULL,archived INTEGER NOT NULL CHECK(archived IN(0,1)),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX _agreement_drafts_customer ON _agreement_drafts(customer_id,archived,number);
CREATE TABLE _agreement_draft_revisions(agreement_id TEXT NOT NULL REFERENCES _agreement_drafts(id) ON DELETE RESTRICT,version INTEGER NOT NULL CHECK(version>0),document_json TEXT NOT NULL CHECK(json_valid(document_json)),actor_id TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(agreement_id,version));
CREATE TABLE _agreement_draft_sites(agreement_id TEXT NOT NULL,version INTEGER NOT NULL,site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,PRIMARY KEY(agreement_id,version,site_id),FOREIGN KEY(agreement_id,version) REFERENCES _agreement_draft_revisions(agreement_id,version) ON DELETE RESTRICT);
CREATE TABLE _agreement_draft_assets(agreement_id TEXT NOT NULL,version INTEGER NOT NULL,asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,PRIMARY KEY(agreement_id,version,asset_id),FOREIGN KEY(agreement_id,version) REFERENCES _agreement_draft_revisions(agreement_id,version) ON DELETE RESTRICT);
CREATE TABLE _agreement_draft_requests(request_key TEXT PRIMARY KEY,actor_id TEXT NOT NULL,request_hash TEXT NOT NULL,result_json TEXT NOT NULL CHECK(json_valid(result_json)),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
${['_agreement_draft_revisions', '_agreement_draft_sites', '_agreement_draft_assets', '_agreement_draft_requests'].flatMap(table => ['UPDATE', 'DELETE'].map(action => `CREATE TRIGGER ${table}_${action.toLowerCase()} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'AGREEMENT_DRAFT_HISTORY_IMMUTABLE'); END;`)).join(' ')}
CREATE TRIGGER _agreement_draft_identity BEFORE UPDATE OF id,number,customer_id,created_at ON _agreement_drafts BEGIN SELECT RAISE(ABORT,'AGREEMENT_DRAFT_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER _agreement_draft_no_delete BEFORE DELETE ON _agreement_drafts BEGIN SELECT RAISE(ABORT,'AGREEMENT_DRAFT_HISTORY_IMMUTABLE'); END;
`;
export function createAgreementRepository(storage) {
    const db = storage.database;
    migrate(db, '_agreement_draft_migrations', [{ version: 1, sql }, { version: 2, sql: reviewSchema }]);
    const project = row => {if(!row)return null;const {document_json,...head}=row;return {...head,document:JSON.parse(document_json),identifier:'AGR-'+String(row.number).padStart(6,'0'),status:row.archived?'archived_draft':'draft',coverageEnforced:false};};
    const head = id => project(db.prepare('SELECT d.*,r.document_json,r.actor_id AS actorId,r.reason FROM _agreement_drafts d JOIN _agreement_draft_revisions r ON r.agreement_id=d.id AND r.version=d.version WHERE d.id=?').get(id));
    const customer = id => {
        const row = db.prepare('SELECT id,name FROM customers WHERE id=?').get(id);
        if (!row)
            fail('Customer not found.', 404);
        return {...row};
    };
    return {
        reviewHead: (id, version) => {const row=db.prepare('SELECT id,sequence,action,status,source_hash AS sourceHash,actor_id AS actorId,reason,created_at AS createdAt FROM _agreement_draft_reviews WHERE agreement_id=? AND version=? ORDER BY sequence DESC LIMIT 1').get(id,version);return row?{...row}:null;},
        reviewHistory: (id, page) => db.prepare('SELECT id,version,sequence,action,status,source_hash AS sourceHash,context_json,actor_id AS actorId,reason,created_at AS createdAt FROM _agreement_draft_reviews WHERE agreement_id=? ORDER BY rowid DESC LIMIT 26 OFFSET ?').all(id, (page - 1) * 25).map(({ context_json, ...row }) => ({ ...row, context: JSON.parse(context_json) })),
        reviewExists: id => !!db.prepare('SELECT 1 FROM _agreement_draft_reviews WHERE id=?').get(id),
        addReview: (id, agreementId, version, sequence, action, status, sourceHash, context, user, reason) => db.prepare('INSERT INTO _agreement_draft_reviews(id,agreement_id,version,sequence,action,status,source_hash,context_json,actor_id,reason) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, agreementId, version, sequence, action, status, sourceHash, JSON.stringify(context), user.id, reason),
        scope(document) { return { sites: document.siteIds.map(id => db.prepare('SELECT id,name FROM sites WHERE id=?').get(id)), assets: document.assetIds.map(id => db.prepare('SELECT id,name,serial_number AS serialNumber,site_id AS siteId FROM assets WHERE id=?').get(id)) }; },
        options(q) {
            const bindings = { customer: { table: 'customers', where: '1=1', args: [], projection: 'id,name' }, site: { table: 'sites', where: 'customer_id=?', args: [q.customerId], projection: 'id,name' }, asset: { table: 'assets', where: 'customer_id=?', args: [q.customerId], projection: 'id,name,serial_number AS serialNumber,site_id AS siteId' } };
            const b = bindings[q.kind];
            if (q.kind !== 'customer')
                customer(q.customerId);
            const where = b.where + ' AND (instr(lower(name),lower(?))>0' + (q.kind === 'asset' ? ' OR instr(lower(serial_number),lower(?))>0' : '') + ')', args = [...b.args, q.search, ...(q.kind === 'asset' ? [q.search] : [])];
            const rows = db.prepare('SELECT ' + b.projection + ' FROM ' + b.table + ' WHERE ' + where + ' ORDER BY name,id LIMIT 26 OFFSET ?').all(...args, (q.page - 1) * 25);
            return { kind: q.kind, rows: rows.slice(0, 25), hasMore: rows.length > 25, page: q.page };
        },
        within: work => transaction(db, work), head, customer,
        prior: key => db.prepare('SELECT * FROM _agreement_draft_requests WHERE request_key=?').get(key),
        acknowledge: (key, user, hash, result) => db.prepare('INSERT INTO _agreement_draft_requests(request_key,actor_id,request_hash,result_json) VALUES(?,?,?,?)').run(key, user.id, hash, JSON.stringify(result)),
        validateCoverage(document) {
            customer(document.customerId);
            for (const id of document.siteIds) {
                const site = db.prepare('SELECT customer_id FROM sites WHERE id=?').get(id);
                if (!site || site.customer_id !== document.customerId)
                    fail('Choose locations belonging to the agreement customer.', 409);
            }
            for (const id of document.assetIds) {
                const asset = db.prepare('SELECT customer_id,site_id FROM assets WHERE id=?').get(id);
                if (!asset || asset.customer_id !== document.customerId || !document.siteIds.includes(asset.site_id))
                    fail('Every selected equipment item must belong to this customer and a selected location.', 409);
            }
        },
        save(document, user, reason) {
            const old = head(document.id), version = (old?.version ?? 0) + 1;
            if (!old) {
                const number = db.prepare('SELECT COALESCE(MAX(number),0)+1 AS n FROM _agreement_drafts').get().n;
                db.prepare('INSERT INTO _agreement_drafts(id,number,customer_id,version,title,archived) VALUES(?,?,?,?,?,?)').run(document.id, number, document.customerId, version, document.title, Number(document.archived));
            }
            else
                db.prepare('UPDATE _agreement_drafts SET version=?,title=?,archived=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(version, document.title, Number(document.archived), document.id);
            db.prepare('INSERT INTO _agreement_draft_revisions(agreement_id,version,document_json,actor_id,reason) VALUES(?,?,?,?,?)').run(document.id, version, JSON.stringify(document), user.id, reason);
            for (const siteId of document.siteIds)
                db.prepare('INSERT INTO _agreement_draft_sites(agreement_id,version,site_id) VALUES(?,?,?)').run(document.id, version, siteId);
            for (const assetId of document.assetIds)
                db.prepare('INSERT INTO _agreement_draft_assets(agreement_id,version,asset_id) VALUES(?,?,?)').run(document.id, version, assetId);
            return head(document.id);
        },
        list(q) {
            const clauses = ['(?=1 OR d.archived=0)'], args = [Number(q.includeArchived === 'true')];
            if (q.customerId) {
                clauses.push('d.customer_id=?');
                args.push(q.customerId);
            }
            if (q.search) {
                clauses.push('(instr(lower(d.title),lower(?))>0 OR instr(lower(c.name),lower(?))>0)');
                args.push(q.search, q.search);
            }
            const base = ' FROM _agreement_drafts d JOIN customers c ON c.id=d.customer_id WHERE ' + clauses.join(' AND '), rows = db.prepare('SELECT d.id,d.number,d.title,d.customer_id AS customerId,c.name AS customerName,d.version,d.archived,d.updated_at AS updatedAt' + base + ' ORDER BY d.number DESC LIMIT 25 OFFSET ?').all(...args, (q.page - 1) * 25).map(row => ({ ...row, identifier: 'AGR-' + String(row.number).padStart(6, '0'), status: row.archived ? 'archived_draft' : 'draft', coverageEnforced: false }));
            return { rows, total: db.prepare('SELECT COUNT(*) AS n' + base).get(...args).n, page: q.page, pageSize: 25 };
        },
        history: (id, page) => db.prepare('SELECT version,document_json,actor_id AS actorId,reason,created_at AS createdAt FROM _agreement_draft_revisions WHERE agreement_id=? ORDER BY version DESC LIMIT 26 OFFSET ?').all(id, (page - 1) * 25).map(({ document_json, ...row }) => ({ ...row, document: JSON.parse(document_json) }))
    };
}
