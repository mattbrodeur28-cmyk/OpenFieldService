// CRM-004 schema: customer-scoped activities (notes, tasks, follow-ups) with a
// private vs customer-visible boundary, assignees, reminders and retained outcomes.
// Version 3 is additive; v1/v2 SQL stays unchanged.
export const activitySchema = `
CREATE TABLE _crm_activities(
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK(kind IN ('note','task','follow_up')),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','customer_visible')),
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  assignee_id TEXT NOT NULL DEFAULT '',
  due_at TEXT,
  reminder_at TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done')),
  outcome TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  completed_by TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX _crm_activities_customer ON _crm_activities(customer_id,status,due_at,id);
CREATE INDEX _crm_activities_reminders ON _crm_activities(assignee_id,status,reminder_at,due_at);
`;
