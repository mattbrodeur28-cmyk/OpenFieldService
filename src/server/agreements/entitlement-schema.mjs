// Additive v7: optional entitlement configuration on the retained authorization.
// Existing rows stay null (unknown/unconfigured); amendments are the future path to
// change them, never a silent UPDATE of immutable activation rows.
export const entitlementSchema = `
ALTER TABLE _agreement_activations ADD COLUMN included_visits INTEGER;
ALTER TABLE _agreement_activations ADD COLUMN included_hours INTEGER;
ALTER TABLE _agreement_activations ADD COLUMN response_priority TEXT;
`;
