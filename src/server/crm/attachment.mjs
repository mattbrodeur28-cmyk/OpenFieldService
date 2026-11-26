import { randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "../platform/sqlite.mjs";
import { CrmError, parse, requireReader, requireWriter } from "./domain.mjs";

// CRM-004 attachments: attach an already-uploaded private document to a customer
// activity. Upload stays in the shared document module; this ledger records the link.
export function createCrmAttachments({ storage, customer, audit }) {
    const db = storage.database;
    const input = z.object({ documentId: z.string().uuid() }).strict();
    const activity = (id) => {
        const row = db.prepare("SELECT id,customer_id AS customerId FROM _crm_activities WHERE id=?").get(id);
        if (!row)
            throw new CrmError("Activity not found.", 404);
        return row;
    };
    const documentRow = (id) => {
        if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_document_records'").get())
            throw new CrmError("Private document storage is unavailable.", 503);
        const row = db.prepare("SELECT id,title,original_name AS originalName,archived FROM _document_records WHERE id=?").get(id);
        if (!row || row.archived === 1)
            throw new CrmError("Choose an available document to attach.", 404);
        return { ...row, archived: row.archived === 1 };
    };
    function link(user, customerId, activityId, body) {
        requireWriter(user);
        const data = parse(input, body);
        return transaction(db, () => {
            customer(customerId);
            const a = activity(activityId);
            if (a.customerId !== customerId)
                throw new CrmError("Activity does not belong to this customer.", 404);
            const doc = documentRow(data.documentId);
            if (db.prepare("SELECT 1 FROM _crm_activity_attachments WHERE activity_id=? AND document_id=?").get(activityId, data.documentId))
                throw new CrmError("That document is already attached to this activity.", 409);
            const id = randomUUID();
            db.prepare("INSERT INTO _crm_activity_attachments(id,activity_id,document_id,actor_id) VALUES(?,?,?,?)").run(id, activityId, data.documentId, user.id);
            const row = { id, activityId, documentId: data.documentId, documentTitle: doc.title, originalName: doc.originalName };
            audit(user, "attachment", id, "link", null, row);
            return { attachment: row };
        });
    }
    function list(user, customerId, activityId) {
        requireReader(user);
        customer(customerId);
        const a = activity(activityId);
        if (a.customerId !== customerId)
            throw new CrmError("Activity does not belong to this customer.", 404);
        const rows = db.prepare("SELECT x.id,x.document_id AS documentId,x.actor_id AS actorId,x.created_at AS createdAt,d.title AS documentTitle,d.original_name AS originalName,d.archived FROM _crm_activity_attachments x LEFT JOIN _document_records d ON d.id=x.document_id WHERE x.activity_id=? ORDER BY x.created_at,x.id").all(activityId);
        return { attachments: rows.map(row => ({ ...row, archived: row.archived === 1 })) };
    }
    return { link, list };
}
