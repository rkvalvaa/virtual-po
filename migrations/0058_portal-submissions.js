// Requests submitted through a client portal form (CCT-2438). The composite
// key keeps the client in the request's own organization; the answers are a
// label+value snapshot, so later form edits never change what was asked.
exports.up = pgm => pgm.sql(`
  ALTER TABLE feature_requests
    ADD COLUMN source_form_id UUID REFERENCES intake_forms(id) ON DELETE SET NULL,
    ADD COLUMN source_form_version INTEGER,
    ADD COLUMN client_account_id UUID,
    ADD COLUMN submitter_contact_id UUID REFERENCES client_contacts(id) ON DELETE SET NULL,
    ADD COLUMN form_answers JSONB,
    ADD COLUMN public_reference TEXT UNIQUE,
    ADD CONSTRAINT feature_requests_client_account
      FOREIGN KEY (client_account_id, organization_id) REFERENCES client_accounts(id, organization_id)
      ON DELETE SET NULL (client_account_id);
  CREATE INDEX feature_requests_submitter_recent ON feature_requests(submitter_contact_id, created_at)
    WHERE submitter_contact_id IS NOT NULL;
`);
exports.down = pgm => pgm.sql(`
  ALTER TABLE feature_requests
    DROP CONSTRAINT feature_requests_client_account,
    DROP COLUMN public_reference, DROP COLUMN form_answers, DROP COLUMN submitter_contact_id,
    DROP COLUMN client_account_id, DROP COLUMN source_form_version, DROP COLUMN source_form_id;
`);
