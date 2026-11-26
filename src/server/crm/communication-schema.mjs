// CRM-007 schema: an append-only communication log linking recorded mail/channel
// activity to a customer (and optionally a contact). Version 4 is additive; v1–v3
// SQL stays unchanged. No bytes or provider tokens are stored here.
export const communicationSchema = `
CREATE TABLE _crm_communications(
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  contact_id TEXT REFERENCES _crm_contacts(id) ON DELETE RESTRICT,
  channel TEXT NOT NULL CHECK(channel IN ('email','call','sms','portal','other')),
  direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
  subject TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _crm_communications_customer ON _crm_communications(customer_id,occurred_at,id);
`;
