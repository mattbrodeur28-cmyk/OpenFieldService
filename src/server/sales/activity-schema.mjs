// Version 2 is additive. Never edit version 1 after deployment.
export const activitySchema = `
CREATE TABLE _sales_activities(id TEXT PRIMARY KEY,opportunity_id TEXT NOT NULL REFERENCES _sales_opportunities(id) ON DELETE RESTRICT,kind TEXT NOT NULL CHECK(kind IN ('call','meeting','site_survey','task')),title TEXT NOT NULL,details TEXT NOT NULL DEFAULT '',assignee_id TEXT NOT NULL,due_at TEXT NOT NULL,reminder_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done','cancelled')),outcome TEXT NOT NULL DEFAULT '',team_id TEXT,message_id TEXT,version INTEGER NOT NULL DEFAULT 0,created_by TEXT NOT NULL,completed_by TEXT,completed_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX _sales_activities_opportunity ON _sales_activities(opportunity_id,status,due_at,id);
CREATE INDEX _sales_activities_reminders ON _sales_activities(assignee_id,status,reminder_at,due_at);
`;
