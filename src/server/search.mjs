// Global search: a bounded, read-only projection across native records. Optional
// modules are guarded so a database that never installed a module answers honestly.
export function globalSearch(db, raw) {
    const term = (raw || "").trim().slice(0, 200);
    if (!term)
        return { query: "", results: {} };
    const has = (table) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
    const results = {};
    if (has("customers"))
        results.customers = db.prepare("SELECT id,name,email,phone FROM customers WHERE instr(lower(name),lower(?))>0 OR instr(lower(email),lower(?))>0 OR instr(replace(phone,' ',''),replace(?,' ',''))>0 ORDER BY name COLLATE NOCASE LIMIT 6").all(term, term, term).map((r) => ({ ...r }));
    if (has("_crm_contacts"))
        results.contacts = db.prepare("SELECT id,customer_id AS customerId,name,email,phone FROM _crm_contacts WHERE active=1 AND (instr(lower(name),lower(?))>0 OR instr(lower(email),lower(?))>0) ORDER BY name COLLATE NOCASE LIMIT 6").all(term, term).map((r) => ({ ...r }));
    if (has("_sales_opportunities"))
        results.opportunities = db.prepare("SELECT id,title,customer_id AS customerId,prospect_name AS prospectName,contact_name AS contactName FROM _sales_opportunities WHERE instr(lower(title),lower(?))>0 OR instr(lower(prospect_name),lower(?))>0 OR instr(lower(contact_name),lower(?))>0 ORDER BY updated_at DESC LIMIT 6").all(term, term, term).map((r) => ({ ...r }));
    if (has("jobs"))
        results.jobs = db.prepare("SELECT id,identifier,customer_id AS customerId,status,scheduled_date AS scheduledDate FROM jobs WHERE instr(lower(identifier),lower(?))>0 OR instr(lower(notes),lower(?))>0 ORDER BY updated_at DESC LIMIT 6").all(term, term).map((r) => ({ ...r }));
    if (has("_agreement_drafts"))
        results.agreements = db.prepare("SELECT id,title,customer_id AS customerId FROM _agreement_drafts WHERE instr(lower(title),lower(?))>0 ORDER BY number DESC LIMIT 6").all(term).map((r) => ({ ...r }));
    if (has("assets"))
        results.equipment = db.prepare("SELECT id,name,serial_number AS serialNumber,customer_id AS customerId,site_id AS siteId FROM assets WHERE instr(lower(name),lower(?))>0 OR instr(lower(serial_number),lower(?))>0 ORDER BY name COLLATE NOCASE LIMIT 6").all(term, term).map((r) => ({ ...r }));
    return { query: term, results };
}
