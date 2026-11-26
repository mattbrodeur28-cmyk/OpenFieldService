import { randomUUID } from "node:crypto";
import { transaction } from "../platform/sqlite.mjs";
import { CrmError, requireWriter } from "./domain.mjs";

// CRM-006: validated customer import. A preview parses CSV and reports per-row
// errors; commit applies only valid rows and skips duplicates (by normalized email or
// name). Owner/Admin only. This is a bounded native import, not a provider sync.

function parseCsv(text) {
    const lines = String(text || "").split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) return [];
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const fields = ["name", "email", "phone", "address", "city", "state", "zip", "segment", "accountType"];
    return lines.slice(1).map((line) => {
        const cells = line.split(",");
        const row = {};
        header.forEach((h, i) => { row[h] = (cells[i] || "").trim(); });
        return fields.reduce((out, f) => ({ ...out, [f]: row[f] ?? "" }), {});
    });
}

const validators = {
    name: (v) => { if (!v) return "Name is required."; if (v.length > 200) return "Name is too long."; return null; },
    email: (v) => { if (v && (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) || v.length > 254)) return "Email is invalid."; return null; },
    segment: (v) => { if (v && !["commercial", "residential"].includes(v)) return "Segment must be commercial or residential."; return null; },
    accountType: (v) => { if (v && !["customer", "prospect", "vendor", "inactive"].includes(v)) return "Account type is invalid."; return null; },
};

export function createCrmImport({ db }) {
    const errorsFor = (row) => {
        const errors = [];
        for (const [field, validate] of Object.entries(validators)) {
            const err = validate(row[field] ?? "");
            if (err) errors.push(err);
        }
        return errors;
    };
    function preview(user, raw) {
        requireWriter(user);
        const csv = typeof raw?.csv === "string" ? raw.csv : "";
        const parsed = parseCsv(csv).map((row, index) => ({ line: index + 2, ...row, errors: errorsFor(row) }));
        return { rows: parsed, valid: parsed.filter((r) => !r.errors.length).length, invalid: parsed.filter((r) => r.errors.length).length };
    }
    function commit(user, raw) {
        requireWriter(user);
        const rows = Array.isArray(raw?.rows) ? raw.rows : [];
        return transaction(db, () => {
            let created = 0, skipped = 0;
            for (const row of rows) {
                const errors = errorsFor(row);
                if (errors.length || !row.name) { skipped += 1; continue; }
                const email = (row.email || "").toLowerCase().trim();
                const nameKey = (row.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
                const duplicate = email
                    ? db.prepare("SELECT 1 AS x FROM customers WHERE lower(email)=?").get(email)
                    : db.prepare("SELECT 1 AS x FROM customers WHERE lower(replace(replace(name,' ',''),'\t',''))=?").get(nameKey);
                if (duplicate) { skipped += 1; continue; }
                const id = randomUUID();
                db.prepare("INSERT INTO customers(id,name,email,phone,address,city,state,zip) VALUES(?,?,?,?,?,?,?,?)").run(id, row.name, row.email || "", row.phone || "", row.address || "", row.city || "", row.state || "", row.zip || "");
                db.prepare("INSERT INTO _crm_account_settings(customer_id,segment,account_type) VALUES(?,?,?)").run(id, row.segment || "commercial", row.accountType || "customer");
                created += 1;
            }
            return { created, skipped };
        });
    }
    return { preview, commit };
}
