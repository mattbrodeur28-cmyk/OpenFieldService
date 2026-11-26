import { z } from 'zod';
import { createHash } from 'node:crypto';
import { migrate, transaction } from '../platform/sqlite.mjs';
import { SalesError, parse, requireOwner, version } from './domain.mjs';
import { CrmError } from '../crm/domain.mjs';
import { prospectTarget, prospectSite, prospectContact } from '../crm/prospect-handoff.mjs';
import { audit } from './storage.mjs';
const sql = `
CREATE TABLE _sales_prospect_conversions(id TEXT PRIMARY KEY,opportunity_id TEXT NOT NULL UNIQUE REFERENCES _sales_opportunities(id) ON DELETE RESTRICT,customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,primary_site_id TEXT REFERENCES sites(id) ON DELETE RESTRICT,actor_id TEXT NOT NULL,mapping_json TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE _sales_prospect_requests(request_key TEXT PRIMARY KEY,actor_id TEXT NOT NULL,request_hash TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
${['_sales_prospect_conversions', '_sales_prospect_requests'].flatMap(table => ['UPDATE', 'DELETE'].map(action => `CREATE TRIGGER ${table}_${action.toLowerCase()} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'PROSPECT_CONVERSION_IMMUTABLE'); END;`)).join(' ')}
`;
const uuid = z.string().uuid(), input = z.object({ id: uuid, requestKey: uuid, expectedVersion: version, target: prospectTarget, sites: z.array(prospectSite).max(10), contacts: z.array(prospectContact).max(10), primarySiteId: uuid.nullable(), reason: z.string().trim().min(10).max(2000), reviewAttested: z.literal(true) }).strict();
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function createProspectConversion({ storage, sales, crmHandoff }) {
    const db = storage.database;
    migrate(db, '_sales_prospect_migrations', [{ version: 1, sql }]);
    const authorized = (user, id) => { const row = sales.opportunity(parse(uuid, id)); requireOwner(user, row); return row; };
    function summary(user, id) {
        return transaction(db, () => {
            authorized(user, id);
            const row = db.prepare('SELECT * FROM _sales_prospect_conversions WHERE opportunity_id=?').get(id);
            if (!row)
                return { conversion: null };
            const mapping = JSON.parse(row.mapping_json);
            return { conversion: { id: row.id, customerId: row.customer_id, primarySiteId: row.primary_site_id, actorId: row.actor_id, reason: row.reason, createdAt: row.created_at, createdCustomer: mapping.createdCustomer, siteIds: mapping.siteIds, contactIds: mapping.contactIds } };
        });
    }
    function options(user, id, raw = {}) {
        authorized(user, id);
        const q = parse(z.object({ search: z.string().trim().max(200).default(''), page: z.coerce.number().int().min(1).max(100000).default(1), customerId: uuid.optional() }).strict(), raw);
        return transaction(db, () => {
            const rows = db.prepare("SELECT id,name,email,phone,address FROM customers WHERE instr(lower(name||' '||COALESCE(email,'')||' '||COALESCE(phone,'')),lower(?))>0 ORDER BY name,id LIMIT 26 OFFSET ?").all(q.search, (q.page - 1) * 25);
            return { selectedCustomer: q.customerId ? db.prepare("SELECT id,name,email,phone,address FROM customers WHERE id=?").get(q.customerId) ?? null : null, customers: rows.slice(0, 25), page: q.page, hasMore: rows.length > 25, sites: q.customerId ? db.prepare('SELECT id,name,address FROM sites WHERE customer_id=? ORDER BY name,id LIMIT 101').all(q.customerId).slice(0, 100) : [], sitesTruncated: q.customerId ? db.prepare('SELECT COUNT(*) AS n FROM sites WHERE customer_id=?').get(q.customerId).n > 100 : false };
        });
    }
    function convert(user, id, raw) {
        const d = parse(input, raw), hash = digest({ opportunityId: id, ...d });
        return transaction(db, () => {
            const old = authorized(user, id), prior = db.prepare('SELECT * FROM _sales_prospect_requests WHERE request_key=?').get(d.requestKey);
            if (prior) {
                if (prior.actor_id !== user.id)
                    throw new SalesError('This request belongs to another account.', 403);
                if (prior.request_hash !== hash)
                    throw new SalesError('This request key has different review content.', 409);
                return JSON.parse(prior.result_json);
            }
            if (db.prepare('SELECT 1 FROM _sales_prospect_conversions WHERE opportunity_id=? OR id=?').get(id, d.id))
                throw new SalesError('This prospect already has a retained conversion. Open its linked customer.', 409);
            if (old.version !== d.expectedVersion)
                throw new SalesError('Opportunity changed. Reload and review before converting.', 409);
            if (old.stage_kind !== 'open' || old.customer_id || old.site_id || old.asset_id)
                throw new SalesError('Convert an unlinked open prospect. Existing native relationships must be retained.', 409);
            if (!crmHandoff)
                throw new SalesError('Native CRM handoff is not configured.', 503);
            if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_sales_quote_offers'").get() && db.prepare('SELECT 1 FROM _sales_quote_offers f JOIN _sales_quotes q ON q.id=f.quote_id WHERE q.opportunity_id=? LIMIT 1').get(id))
                throw new SalesError('This prospect has frozen quote identity. Review its existing offer and native mapping through quote conversion.', 409);
            let mapping;
            try {
                mapping = crmHandoff.createInTransaction(user, { target: d.target, sites: d.sites, contacts: d.contacts, primarySiteId: d.primarySiteId, segment: old.segment });
            }
            catch (e) {
                if (e instanceof CrmError)
                    throw new SalesError(e.message, e.status);
                throw e;
            }
            db.prepare('UPDATE _sales_opportunities SET customer_id=?,site_id=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?').run(mapping.customerId, mapping.primarySiteId, id, old.version);
            db.prepare('INSERT INTO _sales_prospect_conversions(id,opportunity_id,customer_id,primary_site_id,actor_id,mapping_json,reason) VALUES(?,?,?,?,?,?,?)').run(d.id, id, mapping.customerId, mapping.primarySiteId, user.id, JSON.stringify(mapping), d.reason);
            const opportunity = sales.opportunity(id);
            audit(db, user, 'opportunity', id, 'prospect_conversion', old, opportunity, d.reason);
            const result = { opportunity, conversion: { id: d.id, ...mapping }, communicationSent: false, jobCreated: false };
            db.prepare('INSERT INTO _sales_prospect_requests(request_key,actor_id,request_hash,result_json) VALUES(?,?,?,?)').run(d.requestKey, user.id, hash, JSON.stringify(result));
            return result;
        });
    }
    return { convert, summary, options };
}
