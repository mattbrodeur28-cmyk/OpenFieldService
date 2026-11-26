import { activationSchema } from "./activation-schema.mjs";
import { offerSchema } from "./offer-schema.mjs";
import { documentSchema } from "./document-schema.mjs";
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
    migrate(db, '_agreement_draft_migrations', [{ version: 1, sql }, { version: 2, sql: reviewSchema }, { version: 3, sql: documentSchema }, { version: 4, sql: offerSchema }, { version: 5, sql: activationSchema }]);
    const project = row => {
        if (!row)
            return null;
        const { document_json, ...head } = row;
        return { ...head, document: JSON.parse(document_json), identifier: 'AGR-' + String(row.number).padStart(6, '0'), status: row.archived ? 'archived_draft' : 'draft', coverageEnforced: false };
    };
    const head = id => project(db.prepare('SELECT d.*,r.document_json,r.actor_id AS actorId,r.reason FROM _agreement_drafts d JOIN _agreement_draft_revisions r ON r.agreement_id=d.id AND r.version=d.version WHERE d.id=?').get(id));
    const customer = id => {
        const row = db.prepare('SELECT id,name FROM customers WHERE id=?').get(id);
        if (!row)
            fail('Customer not found.', 404);
        return { ...row };
    };
    const documentProjection = 'SELECT a.id,a.agreement_id AS agreementId,a.version,a.title,a.original_name AS originalName,a.actor_id AS actorId,a.reason,a.created_at AS createdAt,b.sha256,b.size_bytes AS sizeBytes FROM _agreement_proposed_documents a JOIN _document_blobs b ON b.id=a.blob_id';
    const sourceDocument = (id, version) => {
        if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_document_blobs'").get())
            return null;
        const row = db.prepare(documentProjection + ' WHERE a.agreement_id=? AND a.version=?').get(id, version);
        return row ? { ...row, mediaType: 'application/pdf', scanStatus: 'not_scanned' } : null;
    };
    const offerProjection = 'SELECT id,agreement_id AS agreementId,version,review_id AS reviewId,document_id AS documentId,issuer_version AS issuerVersion,snapshot_json,snapshot_hash AS snapshotHash,pdf_hash AS pdfHash,valid_until AS validUntil,recipient_json,actor_id AS actorId,reason,offered_at AS offeredAt FROM _agreement_offers';
    const offerRecord = row => {
        if (!row)
            return null;
        const { snapshot_json, recipient_json, ...rest } = row;
        return { ...rest, snapshot: JSON.parse(snapshot_json), recipient: JSON.parse(recipient_json) };
    };
    return {
        activationIdentityExists: id => !!db.prepare('SELECT 1 FROM _agreement_activations WHERE id=?').get(id),
        activationCancellationIdentityExists: id => !!db.prepare('SELECT 1 FROM _agreement_activation_cancellations WHERE id=?').get(id),
        activation: id => { const row = db.prepare('SELECT id,agreement_id AS agreementId,offer_id AS offerId,acceptance_event_id AS acceptanceEventId,snapshot_hash AS snapshotHash,pdf_hash AS pdfHash,starts_on AS startsOn,ends_on AS endsOn,time_zone AS timeZone,authorized_on AS authorizedOn,authorized_at AS authorizedAt,actor_id AS actorId,reason FROM _agreement_activations WHERE agreement_id=?').get(id); return row ? { ...row } : null; },
        activationCancellation: id => { const row = db.prepare('SELECT id,activation_id AS activationId,effective_on AS effectiveOn,recorded_at AS recordedAt,actor_id AS actorId,reason FROM _agreement_activation_cancellations WHERE activation_id=?').get(id); return row ? { ...row } : null; },
        activationAsset: id => { const row = db.prepare('SELECT id,customer_id AS customerId,site_id AS siteId,status FROM assets WHERE id=?').get(id); return row ? { ...row } : null; },
        addActivation: (d, agreementId, offer, acceptanceEventId, startsOn, endsOn, zone, authorizedOn, authorizedAt, user) => db.prepare('INSERT INTO _agreement_activations(id,agreement_id,offer_id,acceptance_event_id,snapshot_hash,pdf_hash,starts_on,ends_on,time_zone,authorized_on,authorized_at,actor_id,reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(d.id, agreementId, offer.id, acceptanceEventId, offer.snapshotHash, offer.pdfHash, startsOn, endsOn, zone, authorizedOn, authorizedAt, user.id, d.reason),
        addActivationCancellation: (d, recordedAt, user) => db.prepare('INSERT INTO _agreement_activation_cancellations(id,activation_id,effective_on,recorded_at,actor_id,reason) VALUES(?,?,?,?,?,?)').run(d.id, d.activationId, d.effectiveOn, recordedAt, user.id, d.reason),
        offerIdentityExists: id => !!db.prepare('SELECT 1 FROM _agreement_offers WHERE id=?').get(id),
        offerEventIdentityExists: id => !!db.prepare('SELECT 1 FROM _agreement_offer_events WHERE id=?').get(id),
        offerById: id => offerRecord(db.prepare(offerProjection + ' WHERE id=?').get(id)),
        offerForRevision: (id, version) => offerRecord(db.prepare(offerProjection + ' WHERE agreement_id=? AND version=?').get(id, version)),
        offerEventHead: id => { const row = db.prepare('SELECT id,sequence,action FROM _agreement_offer_events WHERE offer_id=? ORDER BY sequence DESC LIMIT 1').get(id); return row ? { ...row } : null; },
        latestOfferOccurrence: id => db.prepare("SELECT json_extract(evidence_json,'$.occurredAt') AS occurred FROM _agreement_offer_events WHERE offer_id=? AND json_type(evidence_json,'$.occurredAt')='text' ORDER BY sequence DESC LIMIT 1").get(id)?.occurred ?? null,
        acceptedOffer: id => db.prepare("SELECT o.id FROM _agreement_offers o JOIN _agreement_offer_events e ON e.offer_id=o.id WHERE o.agreement_id=? AND e.action='accepted' LIMIT 1").get(id) ?? null,
        lockedOffer: id => db.prepare("SELECT o.id FROM _agreement_offers o WHERE o.agreement_id=? AND (SELECT action FROM _agreement_offer_events e WHERE e.offer_id=o.id ORDER BY sequence DESC LIMIT 1) IN('offer','delivered','accepted') LIMIT 1").get(id) ?? null,
        addOffer: (d, agreementId, version, reviewId, documentId, issuerVersion, snapshot, snapshotHash, pdfHash, user, offeredAt) => db.prepare('INSERT INTO _agreement_offers(id,agreement_id,version,review_id,document_id,issuer_version,snapshot_json,snapshot_hash,pdf_hash,valid_until,recipient_json,actor_id,reason,offered_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(d.id, agreementId, version, reviewId, documentId, issuerVersion, JSON.stringify(snapshot), snapshotHash, pdfHash, d.validUntil, JSON.stringify(d.recipient), user.id, d.reason, offeredAt),
        addOfferEvent: (id, offerId, sequence, action, evidence, user, reason, recordedAt) => db.prepare('INSERT INTO _agreement_offer_events(id,offer_id,sequence,action,evidence_json,actor_id,reason,recorded_at) VALUES(?,?,?,?,?,?,?,?)').run(id, offerId, sequence, action, JSON.stringify(evidence), user.id, reason, recordedAt),
        offerHistory: (id, page) => db.prepare('SELECT e.id,e.offer_id AS offerId,o.version,e.sequence,e.action,e.evidence_json,e.actor_id AS actorId,e.reason,e.recorded_at AS recordedAt FROM _agreement_offer_events e JOIN _agreement_offers o ON o.id=e.offer_id WHERE o.agreement_id=? ORDER BY e.rowid DESC LIMIT 26 OFFSET ?').all(id, (page - 1) * 25).map(({ evidence_json, ...row }) => ({ ...row, evidence: JSON.parse(evidence_json) })),
        sourceDocument,
        documentById(id) { const row = db.prepare(documentProjection + ' WHERE a.id=?').get(id); return row ? { ...row, mediaType: 'application/pdf', scanStatus: 'not_scanned' } : null; },
        documentBytes: id => db.prepare('SELECT b.bytes FROM _agreement_proposed_documents a JOIN _document_blobs b ON b.id=a.blob_id WHERE a.id=?').get(id)?.bytes,
        addDocument(d, agreementId, user, bytes, originalName, sha256) {
            if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_document_blobs'").get())
                fail('Private document storage is unavailable.', 503);
            const existing = db.prepare('SELECT id FROM _document_blobs WHERE sha256=?').get(sha256), blob = existing?.id ?? d.id;
            if (!existing)
                db.prepare('INSERT INTO _document_blobs(id,sha256,size_bytes,media_type,bytes) VALUES(?,?,?,?,?)').run(blob, sha256, bytes.length, 'application/pdf', Buffer.from(bytes));
            db.prepare('INSERT INTO _agreement_proposed_documents(id,agreement_id,version,blob_id,title,original_name,actor_id,reason) VALUES(?,?,?,?,?,?,?,?)').run(d.id, agreementId, d.expectedVersion, blob, d.title, originalName, user.id, d.reason);
            return sourceDocument(agreementId, d.expectedVersion);
        },
        reviewHead: (id, version) => { const row = db.prepare('SELECT id,sequence,action,status,source_hash AS sourceHash,actor_id AS actorId,reason,created_at AS createdAt FROM _agreement_draft_reviews WHERE agreement_id=? AND version=? ORDER BY sequence DESC LIMIT 1').get(id, version); return row ? { ...row } : null; },
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
            const base = ' FROM _agreement_drafts d JOIN customers c ON c.id=d.customer_id WHERE ' + clauses.join(' AND '), rows = db.prepare('SELECT d.id,d.number,d.title,d.customer_id AS customerId,c.name AS customerName,d.version,d.archived,d.updated_at AS updatedAt,(SELECT e.action FROM _agreement_offers o JOIN _agreement_offer_events e ON e.offer_id=o.id WHERE o.agreement_id=d.id AND o.version=d.version ORDER BY e.sequence DESC LIMIT 1) AS offerStatus' + base + ' ORDER BY d.number DESC LIMIT 25 OFFSET ?').all(...args, (q.page - 1) * 25).map(row => ({ ...row, identifier: 'AGR-' + String(row.number).padStart(6, '0'), status: row.archived ? 'archived_draft' : 'draft', coverageEnforced: false }));
            return { rows, total: db.prepare('SELECT COUNT(*) AS n' + base).get(...args).n, page: q.page, pageSize: 25 };
        },
        history: (id, page) => db.prepare('SELECT version,document_json,actor_id AS actorId,reason,created_at AS createdAt FROM _agreement_draft_revisions WHERE agreement_id=? ORDER BY version DESC LIMIT 26 OFFSET ?').all(id, (page - 1) * 25).map(({ document_json, ...row }) => ({ ...row, document: JSON.parse(document_json) }))
    };
}
