exports.up = (pgm) => { pgm.sql(`
  ALTER TABLE feature_requests ADD COLUMN creation_key UUID;
  CREATE UNIQUE INDEX feature_requests_creation_key
    ON feature_requests(organization_id, requester_id, creation_key) WHERE creation_key IS NOT NULL;
`); };
exports.down = (pgm) => { pgm.sql('ALTER TABLE feature_requests DROP COLUMN creation_key;'); };
