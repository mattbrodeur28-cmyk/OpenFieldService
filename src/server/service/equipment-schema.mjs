// Additive migration: historical reports retain their original evidence unchanged.
export const equipmentSchema = `
ALTER TABLE _service_reports ADD COLUMN asset_id TEXT REFERENCES assets(id) ON DELETE RESTRICT;
ALTER TABLE _service_reports ADD COLUMN equipment_json TEXT NOT NULL DEFAULT '';
CREATE TRIGGER _service_report_equipment BEFORE INSERT ON _service_reports WHEN NEW.asset_id IS NULL OR NOT EXISTS(SELECT 1 FROM jobs j JOIN assets a ON a.id=j.asset_id AND a.customer_id=j.customer_id WHERE j.id=NEW.job_id AND a.id=NEW.asset_id) OR NEW.equipment_json='' BEGIN SELECT RAISE(ABORT,'SERVICE_EQUIPMENT_REQUIRED'); END;
CREATE TRIGGER _service_draft_equipment_insert BEFORE INSERT ON _service_report_drafts WHEN NOT EXISTS(SELECT 1 FROM jobs j JOIN assets a ON a.id=j.asset_id AND a.customer_id=j.customer_id WHERE j.id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'SERVICE_EQUIPMENT_REQUIRED'); END;
CREATE TRIGGER _service_draft_equipment_update BEFORE UPDATE ON _service_report_drafts WHEN NOT EXISTS(SELECT 1 FROM jobs j JOIN assets a ON a.id=j.asset_id AND a.customer_id=j.customer_id WHERE j.id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'SERVICE_EQUIPMENT_REQUIRED'); END;
`;
