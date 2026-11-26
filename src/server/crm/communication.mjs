import { randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "../platform/sqlite.mjs";
import { CrmError, parse, requireReader, requireWriter } from "./domain.mjs";

// CRM-007 application service: staff-recorded communications linked to a customer,
// with outbound consent checked against the contact's channel preferences. This logs
// activity performed elsewhere; it does not send email/SMS or verify provider receipt.
const instant = z
  .string()
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)), "Choose a valid date and time.")
  .transform((value) => new Date(value).toISOString());

const input = z
  .object({
    contactId: z.string().uuid().nullable().default(null),
    channel: z.enum(["email", "call", "sms", "portal", "other"]),
    direction: z.enum(["inbound", "outbound"]),
    subject: z.string().trim().max(200).default(""),
    summary: z.string().trim().max(8000).default(""),
    reference: z.string().trim().max(1000).default(""),
    occurredAt: instant,
  })
  .strict();

const projection = `SELECT id,customer_id AS customerId,contact_id AS contactId,channel,direction,subject,summary,reference,occurred_at AS occurredAt,created_by AS createdBy,created_at AS createdAt FROM _crm_communications`;

export function createCrmCommunications({ storage, customer, contact, audit }) {
  const db = storage.database;

  function record(user, customerId, body) {
    requireWriter(user);
    const data = parse(input, body);
    return transaction(db, () => {
      customer(customerId);
      if (data.contactId) {
        const target = contact(data.contactId);
        if (target.customer_id !== customerId)
          throw new CrmError("Contact does not belong to this customer.", 404);
        if (data.direction === "outbound") {
          if (data.channel === "email" && !target.email_ok)
            throw new CrmError("This contact has not consented to email.", 409);
          if (data.channel === "sms" && !target.sms_ok)
            throw new CrmError("This contact has not consented to SMS.", 409);
          if (data.channel === "call" && !target.phone_ok)
            throw new CrmError("This contact has not consented to phone calls.", 409);
        }
      }
      const id = randomUUID();
      db.prepare(
        "INSERT INTO _crm_communications(id,customer_id,contact_id,channel,direction,subject,summary,reference,occurred_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ).run(id, customerId, data.contactId, data.channel, data.direction, data.subject, data.summary, data.reference, data.occurredAt, user.id);
      const row = db.prepare(projection + " WHERE id=?").get(id);
      audit(user, "communication", id, "create", null, { ...row });
      return { communication: { ...row } };
    });
  }

  function list(user, customerId, query = {}) {
    requireReader(user);
    customer(customerId);
    const page = Number(query.page || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000)
      throw new CrmError("Choose a valid communication page.");
    const where = ["customer_id=?"], params = [customerId];
    if (query.channel && query.channel !== "all") {
      where.push("channel=?");
      params.push(query.channel);
    }
    const base = projection + " WHERE " + where.join(" AND ");
    return transaction(db, () => ({
      communications: db.prepare(base + " ORDER BY occurred_at DESC,id LIMIT 50 OFFSET ?").all(...params, (page - 1) * 50).map((row) => ({ ...row })),
      total: db.prepare("SELECT COUNT(*) AS n FROM (" + base + ")").get(...params).n,
      page,
      pageSize: 50,
    }));
  }

  return { record, list };
}
