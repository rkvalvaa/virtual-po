// Internal request forms (CCT-2439). A form is either published to a client
// (CLIENT: files PRODUCT requests through the portal) or used by workspace
// members (INTERNAL: files CHANGE requests into a service group). What a form
// files is fixed on its row, so a submission can never choose its own type,
// group or organization.
exports.up = pgm => pgm.sql(`
  ALTER TABLE intake_forms
    ADD COLUMN audience TEXT NOT NULL DEFAULT 'CLIENT' CHECK (audience IN ('CLIENT', 'INTERNAL')),
    ADD COLUMN request_type TEXT NOT NULL DEFAULT 'PRODUCT' CHECK (request_type IN ('PRODUCT', 'CHANGE')),
    ADD COLUMN service_group_id UUID,
    ALTER COLUMN client_account_id DROP NOT NULL,
    ADD CONSTRAINT intake_forms_audience CHECK (CASE WHEN audience = 'CLIENT'
      THEN client_account_id IS NOT NULL AND service_group_id IS NULL AND request_type = 'PRODUCT'
      ELSE client_account_id IS NULL AND service_group_id IS NOT NULL AND request_type = 'CHANGE' END),
    ADD CONSTRAINT intake_forms_service_group FOREIGN KEY (service_group_id, organization_id)
      REFERENCES service_groups(id, organization_id);
`);
exports.down = pgm => pgm.sql(`
  DELETE FROM intake_forms WHERE audience = 'INTERNAL';
  ALTER TABLE intake_forms
    DROP CONSTRAINT intake_forms_service_group,
    DROP CONSTRAINT intake_forms_audience,
    DROP COLUMN service_group_id, DROP COLUMN request_type, DROP COLUMN audience,
    ALTER COLUMN client_account_id SET NOT NULL;
`);
