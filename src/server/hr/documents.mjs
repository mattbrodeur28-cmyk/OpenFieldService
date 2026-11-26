import { z } from 'zod';
import { randomUUID, createHash } from 'node:crypto';
import { migrate, transaction } from '../platform/sqlite.mjs';
import { identifyFile, MAX_DOCUMENT_BYTES } from '../documents/service.mjs';
import { ServiceIdentityError } from '../service/identity.mjs';
import { HrError, peopleManager, parse, uuid, fail } from './domain.mjs';
export { MAX_DOCUMENT_BYTES };
const sql = `
CREATE TABLE _hr_personnel_documents(id TEXT PRIMARY KEY,staff_id TEXT NOT NULL REFERENCES _hr_staff(id) ON DELETE RESTRICT,blob_id TEXT NOT NULL REFERENCES _document_blobs(id) ON DELETE RESTRICT,title TEXT NOT NULL,category TEXT NOT NULL,expires_on TEXT NOT NULL,original_name TEXT NOT NULL,actor_id TEXT NOT NULL,archived INTEGER NOT NULL CHECK(archived IN(0,1)),version INTEGER NOT NULL CHECK(version>0),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX _hr_personnel_staff ON _hr_personnel_documents(staff_id,archived,created_at,id);
CREATE TABLE _hr_personnel_document_events(id INTEGER PRIMARY KEY AUTOINCREMENT,document_id TEXT NOT NULL REFERENCES _hr_personnel_documents(id) ON DELETE RESTRICT,actor_id TEXT NOT NULL,action TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX _hr_personnel_document_history ON _hr_personnel_document_events(document_id,id);
CREATE TABLE _hr_personnel_document_requests(request_key TEXT PRIMARY KEY,actor_id TEXT NOT NULL,request_hash TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
${['_hr_personnel_document_events', '_hr_personnel_document_requests'].flatMap(t => ['UPDATE', 'DELETE'].map(action => `CREATE TRIGGER ${t}_${action.toLowerCase()} BEFORE ${action} ON ${t} BEGIN SELECT RAISE(ABORT,'HR_DOCUMENT_HISTORY_IMMUTABLE'); END;`)).join(' ')}
CREATE TRIGGER _hr_personnel_document_identity BEFORE UPDATE OF id,staff_id,blob_id,original_name,actor_id,created_at ON _hr_personnel_documents BEGIN SELECT RAISE(ABORT,'HR_DOCUMENT_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER _hr_personnel_document_no_delete BEFORE DELETE ON _hr_personnel_documents BEGIN SELECT RAISE(ABORT,'HR_DOCUMENT_HISTORY_IMMUTABLE'); END;
`;
const category = z.enum(['employment', 'certification', 'training', 'license', 'other']), reason = z.string().trim().min(10).max(2000), expires = z.string().refine(v => v === '' || (/^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v), 'Choose a valid expiry date.'), fields = { title: z.string().trim().min(1).max(160), category, expiresOn: expires, reason };
const uploadInput = z.object({ id: uuid, requestKey: uuid, ...fields }).strict(), editInput = z.object({ requestKey: uuid, expectedVersion: z.number().int().positive().safe(), ...fields, archived: z.boolean() }).strict();
const listQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), includeArchived: z.enum(['true', 'false']).default('false') }).strict(), pageQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
const hash = v => createHash('sha256').update(v).digest('hex');
export function createPersonnelDocuments({ storage }) {
    const db = storage.database;
    migrate(db, '_hr_personnel_document_migrations', [{ version: 1, sql }]);
    const staff = id => { parse(uuid, id); const row = db.prepare('SELECT id,name,technician_id FROM _hr_staff WHERE id=?').get(id); if (!row)
        fail('Staff member not found.', 404); return row; };
    const projection = 'SELECT d.id,d.staff_id AS staffId,d.title,d.category,d.expires_on AS expiresOn,d.original_name AS originalName,d.actor_id AS actorId,d.archived,d.version,d.created_at AS createdAt,b.sha256,b.size_bytes AS sizeBytes,b.media_type AS mediaType FROM _hr_personnel_documents d JOIN _document_blobs b ON b.id=d.blob_id';
    const record = id => { parse(uuid, id); const row = db.prepare(projection + ' WHERE d.id=?').get(id); if (!row)
        fail('Personnel document not found.', 404); staff(row.staffId); return { ...row, scanStatus: 'not_scanned' }; };
    const audit = (user, id, action, before, after, reason) => db.prepare('INSERT INTO _hr_personnel_document_events(document_id,actor_id,action,before_json,after_json,reason) VALUES(?,?,?,?,?,?)').run(id, user.id, action, JSON.stringify(before), JSON.stringify(after), reason);
    function command(user, key, fingerprint, work) { return transaction(db, () => { const prior = db.prepare('SELECT * FROM _hr_personnel_document_requests WHERE request_key=?').get(key); if (prior) {
        if (prior.actor_id !== user.id)
            fail('This request belongs to another account.', 403);
        if (prior.request_hash !== fingerprint)
            fail('This request key has different document content.', 409);
        return JSON.parse(prior.result_json);
    } const result = work(); db.prepare('INSERT INTO _hr_personnel_document_requests(request_key,actor_id,request_hash,result_json) VALUES(?,?,?,?)').run(key, user.id, fingerprint, JSON.stringify(result)); return result; }); }
    function list(user, staffId, raw = {}) { peopleManager(user); const q = parse(listQuery, raw); return transaction(db, () => { const employee = staff(staffId), where = ' WHERE d.staff_id=? AND (?=1 OR d.archived=0)', args = [staffId, Number(q.includeArchived === 'true')], rows = db.prepare(projection + where + ' ORDER BY d.created_at DESC,d.rowid DESC LIMIT 25 OFFSET ?').all(...args, (q.page - 1) * 25), total = db.prepare('SELECT COUNT(*) AS n FROM _hr_personnel_documents d' + where).get(...args).n; return { staff: employee, rows: rows.map(row => ({ ...row, scanStatus: 'not_scanned' })), total, page: q.page, pageSize: 25 }; }); }
    function upload(user, staffId, raw, bytes, originalName) {
        peopleManager(user);
        parse(uuid, staffId);
        const d = parse(uploadInput, raw);
        let mediaType;
        try {
            mediaType = identifyFile(bytes);
        }
        catch (error) {
            if (error instanceof ServiceIdentityError)
                throw new HrError(error.message, error.status);
            throw error;
        }
        const original = typeof originalName === 'string' ? originalName.replaceAll('\\', '/').split('/').pop().replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200) || 'document' : 'document', digest = hash(bytes), fingerprint = hash(JSON.stringify({ action: 'upload', staffId, ...d, digest, original, mediaType, size: bytes.length }));
        return command(user, d.requestKey, fingerprint, () => { staff(staffId); if (db.prepare('SELECT 1 FROM _hr_personnel_documents WHERE id=?').get(d.id))
            fail('Personnel document identity already exists.', 409); const existing = db.prepare('SELECT id FROM _document_blobs WHERE sha256=?').get(digest), blob = existing?.id ?? randomUUID(); if (!existing)
            db.prepare('INSERT INTO _document_blobs(id,sha256,size_bytes,media_type,bytes) VALUES(?,?,?,?,?)').run(blob, digest, bytes.length, mediaType, Buffer.from(bytes)); db.prepare('INSERT INTO _hr_personnel_documents(id,staff_id,blob_id,title,category,expires_on,original_name,actor_id,archived,version) VALUES(?,?,?,?,?,?,?,?,0,1)').run(d.id, staffId, blob, d.title, d.category, d.expiresOn, original, user.id); const document = record(d.id); audit(user, d.id, 'uploaded', null, document, d.reason); return { document }; });
    }
    function edit(user, id, raw) { peopleManager(user); parse(uuid, id); const d = parse(editInput, raw); return command(user, d.requestKey, hash(JSON.stringify({ action: 'edit', documentId: id, ...d })), () => { const before = record(id); if (before.version !== d.expectedVersion)
        fail('Document changed. Reload before saving.', 409); if (before.version === Number.MAX_SAFE_INTEGER)
        fail('Document version needs review.', 409); db.prepare('UPDATE _hr_personnel_documents SET title=?,category=?,expires_on=?,archived=?,version=version+1 WHERE id=?').run(d.title, d.category, d.expiresOn, Number(d.archived), id); const document = record(id); audit(user, id, 'metadata_updated', before, document, d.reason); return { document }; }); }
    function download(user, id) { peopleManager(user); return transaction(db, () => { const metadata = record(id), row = db.prepare('SELECT b.bytes FROM _hr_personnel_documents d JOIN _document_blobs b ON b.id=d.blob_id WHERE d.id=?').get(id); return { metadata, bytes: new Uint8Array(row.bytes) }; }); }
    function history(user, id, raw = {}) { peopleManager(user); parse(uuid, id); const { page } = parse(pageQuery, raw); return transaction(db, () => { record(id); const rows = db.prepare('SELECT id,actor_id AS actorId,action,before_json,after_json,reason,created_at AS createdAt FROM _hr_personnel_document_events WHERE document_id=? ORDER BY id DESC LIMIT 26 OFFSET ?').all(id, (page - 1) * 25).map(({ before_json, after_json, ...row }) => ({ ...row, before: JSON.parse(before_json), after: JSON.parse(after_json) })); return { rows: rows.slice(0, 25), hasMore: rows.length > 25, page }; }); }
    return { list, upload, edit, download, history };
}
