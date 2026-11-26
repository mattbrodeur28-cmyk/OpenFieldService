// CRM-004 attachments: link an already-uploaded private document to a customer
// activity. Version 5 is additive; v1–v4 SQL stays unchanged. `document_id` is a soft
// reference to the shared private-document store (validated at link time), so this
// ledger installs independently of the documents module's install order.
export const attachmentSchema = `
CREATE TABLE _crm_activity_attachments(
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES _crm_activities(id) ON DELETE RESTRICT,
  document_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _crm_activity_attachments_activity ON _crm_activity_attachments(activity_id,created_at,id);
CREATE TRIGGER _crm_activity_attachments_no_update BEFORE UPDATE ON _crm_activity_attachments BEGIN SELECT RAISE(ABORT,'CRM_ATTACHMENT_IMMUTABLE'); END;
CREATE TRIGGER _crm_activity_attachments_no_delete BEFORE DELETE ON _crm_activity_attachments BEGIN SELECT RAISE(ABORT,'CRM_ATTACHMENT_IMMUTABLE'); END;
`;
