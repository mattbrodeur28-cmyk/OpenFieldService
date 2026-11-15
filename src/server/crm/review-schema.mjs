// Additive v2: retain the applied v1 SQL byte-for-byte.
export const reviewSchema = `
ALTER TABLE _crm_account_settings ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
CREATE TRIGGER _crm_audit_no_update BEFORE UPDATE ON _crm_audit BEGIN SELECT RAISE(ABORT,'CRM_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER _crm_audit_no_delete BEFORE DELETE ON _crm_audit BEGIN SELECT RAISE(ABORT,'CRM_AUDIT_IMMUTABLE'); END;
`;
