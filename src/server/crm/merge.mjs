import { randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "../platform/sqlite.mjs";
import { CrmError, requireWriter } from "./domain.mjs";

// CRM-006: a reviewed customer merge. Live references move onto the surviving target;
// immutable historical snapshots keep their original customer id. Protected records
// (e.g. a site held by a quoted service contract) abort the whole merge via triggers.
export function createCrmMerge({ db, customer, audit }) {
    const input = z.object({
        targetId: z.string().uuid(),
        sourceId: z.string().uuid(),
        reason: z.string().trim().min(10).max(2000),
        reviewAttested: z.literal(true),
    }).strict();
    const has = (table) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
    // Live references that must follow the surviving customer. Assets before jobs so the
    // job↔equipment customer check still holds after remapping.
    const live = ["sites", "assets", "jobs", "invoices", "_crm_contacts", "_crm_activities", "_crm_communications", "_agreement_drafts", "_sales_opportunities"];
    function merge(user, raw) {
        requireWriter(user);
        const d = input.parse(raw);
        if (d.targetId === d.sourceId)
            throw new CrmError("Choose two different customers to merge.");
        return transaction(db, () => {
            // The assets(site_id, customer_id) → sites(id, customer_id) composite FK is
            // circular for a merge (site and asset must both move together). Defer FK
            // checks to commit so the intermediate remaps are validated atomically.
            db.exec("PRAGMA defer_foreign_keys = ON");
            const target = customer(d.targetId), source = customer(d.sourceId);
            const remapped = {};
            for (const table of live) {
                if (!has(table)) continue;
                const result = db.prepare(`UPDATE ${table} SET customer_id=? WHERE customer_id=?`).run(d.targetId, d.sourceId);
                if (result.changes) remapped[table] = result.changes;
            }
            // Billing links move, skipping any that would collide with an existing link.
            if (has("_crm_billing_links")) {
                const links = db.prepare("SELECT id,site_id FROM _crm_billing_links WHERE billing_customer_id=?").all(d.sourceId);
                for (const link of links) {
                    const conflict = db.prepare("SELECT 1 AS x FROM _crm_billing_links WHERE site_id=? AND billing_customer_id=? AND id<>?").get(link.site_id, d.targetId, link.id);
                    if (!conflict) db.prepare("UPDATE _crm_billing_links SET billing_customer_id=? WHERE id=?").run(d.targetId, link.id);
                }
            }
            if (has("_crm_account_settings")) {
                db.prepare("UPDATE _crm_account_settings SET parent_customer_id=? WHERE parent_customer_id=?").run(d.targetId, d.sourceId);
                db.prepare("INSERT OR IGNORE INTO _crm_account_settings(customer_id) VALUES(?)").run(d.sourceId);
                db.prepare("UPDATE _crm_account_settings SET account_type='inactive' WHERE customer_id=?").run(d.sourceId);
            }
            db.prepare("INSERT INTO _crm_merges(id,target_id,source_id,actor_id,reason) VALUES(?,?,?,?,?)").run(randomUUID(), d.targetId, d.sourceId, user.id, d.reason);
            audit(user, "customer", d.sourceId, "merge", source, target);
            return { targetId: d.targetId, sourceId: d.sourceId, remapped, sourceAccountType: "inactive" };
        });
    }
    return { merge };
}
