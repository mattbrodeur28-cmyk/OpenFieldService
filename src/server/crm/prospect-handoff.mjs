import { z } from 'zod';
import { CrmError, requireWriter, parse, contactInput, validateContact } from './domain.mjs';
const uuid = z.string().uuid(), text = max => z.string().trim().max(max), email = z.union([z.literal(''), z.string().email().max(254)]);
const account = z.object({ id: uuid, name: text(200).min(1), email: email.default(''), phone: text(60).default(''), address: text(500).default(''), city: text(100).default(''), state: text(100).default(''), zip: text(30).default(''), notes: text(2000).default('') }).strict();
export const prospectTarget = z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('new'), account }).strict(),
    z.object({ mode: z.literal('existing'), customerId: uuid }).strict()
]);
export const prospectSite = z.object({ id: uuid, name: text(200).min(1), address: text(1000).min(1) }).strict();
export const prospectContact = contactInput.omit({ expectedVersion: true }).extend({ id: uuid }).strict();
export const prospectMapping = z.object({ target: prospectTarget, sites: z.array(prospectSite).max(10), contacts: z.array(prospectContact).max(10), primarySiteId: uuid.nullable(), segment: z.enum(['commercial', 'residential']) }).strict();
export function createCrmProspectHandoff({ storage, createContactInTransaction, audit, timeZone = () => 'UTC' }) {
    const db = storage.database;
    function createInTransaction(user, raw) {
        requireWriter(user);
        if (!db.isTransaction)
            throw new Error('CRM prospect handoff requires its caller transaction.');
        const d = parse(prospectMapping, raw), creating = d.target.mode === 'new';
        let customerId;
        if (creating) {
            const a = d.target.account;
            customerId = a.id;
            const duplicate = db.prepare("SELECT id FROM customers WHERE lower(trim(name))=lower(trim(?)) OR (?<>'' AND lower(trim(email))=lower(trim(?))) LIMIT 1").get(a.name, a.email, a.email);
            if (duplicate)
                throw new CrmError('A customer with this name or email already exists. Search and reuse that account before converting.', 409);
            if (db.prepare('SELECT 1 FROM customers WHERE id=?').get(customerId))
                throw new CrmError('Customer identity already exists.', 409);
            db.prepare('INSERT INTO customers(id,name,email,phone,address,city,state,zip,notes) VALUES(?,?,?,?,?,?,?,?,?)').run(customerId, a.name, a.email, a.phone, a.address, a.city, a.state, a.zip, a.notes);
            db.prepare("INSERT INTO _crm_account_settings(customer_id,segment,account_type,version) VALUES(?,?,'customer',1)").run(customerId, d.segment);
            audit(user, 'account', customerId, 'prospect_conversion', null, { ...a, segment: d.segment, accountType: 'customer' });
        }
        else {
            customerId = d.target.customerId;
            if (!db.prepare('SELECT 1 FROM customers WHERE id=?').get(customerId))
                throw new CrmError('Customer no longer exists.', 404);
            const settings = db.prepare('SELECT account_type FROM _crm_account_settings WHERE customer_id=?').get(customerId);
            if (settings && settings.account_type !== 'customer')
                throw new CrmError('Review this existing account classification before using it as the customer.', 409);
        }
        const siteIds = [];
        for (const s of d.sites) {
            if (db.prepare('SELECT 1 FROM sites WHERE id=? OR (customer_id=? AND lower(trim(name))=lower(trim(?)))').get(s.id, customerId, s.name))
                throw new CrmError('A location with this identity or name already exists. Reuse the existing location.', 409);
            const zone = timeZone();
            try {
                new Intl.DateTimeFormat('en-US', { timeZone: zone });
            }
            catch {
                throw new CrmError('Review the company timezone before creating locations.', 409);
            }
            db.prepare('INSERT INTO sites(id,customer_id,name,address,timezone) VALUES(?,?,?,?,?)').run(s.id, customerId, s.name, s.address, zone);
            siteIds.push(s.id);
            audit(user, 'site', s.id, 'prospect_conversion', null, { ...s, customerId, timeZone: zone });
        }
        if (d.primarySiteId && !db.prepare('SELECT 1 FROM sites WHERE id=? AND customer_id=?').get(d.primarySiteId, customerId))
            throw new CrmError('The primary location must belong to the selected customer.', 409);
        const contactIds = [];
        for (const c of d.contacts) {
            validateContact(c);
            if (db.prepare("SELECT 1 FROM _crm_contacts WHERE id=?").get(c.id))
                throw new CrmError("Contact identity already exists.", 409);
            const duplicate = db.prepare("SELECT 1 FROM _crm_contacts WHERE customer_id=? AND ((?<>'' AND lower(trim(email))=lower(trim(?))) OR (lower(trim(name))=lower(trim(?)) AND phone=?)) LIMIT 1").get(customerId, c.email, c.email, c.name, c.phone);
            if (duplicate)
                throw new CrmError('A contact already exists on this account. Omit that new contact and reuse its retained CRM record.', 409);
            // Public and handoff paths share the same contact validation, roles and audit.
            const { id, ...input } = c;
            const saved = createContactInTransaction(user, customerId, input, id);
            contactIds.push(saved.id);
        }
        return { customerId, createdCustomer: creating, siteIds, contactIds, primarySiteId: d.primarySiteId };
    }
    return { createInTransaction };
}
