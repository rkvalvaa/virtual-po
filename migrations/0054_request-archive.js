exports.up = pgm => pgm.sql(`
  ALTER TABLE feature_requests ADD COLUMN archived_at TIMESTAMPTZ,
    ADD COLUMN archived_by UUID REFERENCES users(id) ON DELETE SET NULL;
  CREATE INDEX feature_requests_active_org_idx ON feature_requests(organization_id,created_at DESC) WHERE archived_at IS NULL;
`);
exports.down = pgm => pgm.sql('ALTER TABLE feature_requests DROP COLUMN archived_by, DROP COLUMN archived_at');
