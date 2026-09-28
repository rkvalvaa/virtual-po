// Change-request workflow state (CCT-2434). Product requests keep using
// `status`; every other request type carries the workflow version it started
// on and its current state, which only lib/workflows/transition.ts writes.
// workflow_data holds the details a stage needs (plan, evidence, notes).
exports.up = pgm => pgm.sql(`
  ALTER TABLE feature_requests
    ADD COLUMN workflow_version INTEGER,
    ADD COLUMN workflow_state TEXT,
    ADD COLUMN workflow_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD CONSTRAINT feature_requests_workflow CHECK (CASE WHEN request_type = 'PRODUCT'
      THEN workflow_version IS NULL AND workflow_state IS NULL
      ELSE workflow_version IS NOT NULL AND workflow_state IS NOT NULL END);
  CREATE OR REPLACE VIEW product_requests AS SELECT * FROM feature_requests WHERE request_type = 'PRODUCT';
`);
exports.down = pgm => pgm.sql(`
  DROP VIEW product_requests;
  ALTER TABLE feature_requests
    DROP CONSTRAINT feature_requests_workflow,
    DROP COLUMN workflow_data, DROP COLUMN workflow_state, DROP COLUMN workflow_version;
  CREATE VIEW product_requests AS SELECT * FROM feature_requests WHERE request_type = 'PRODUCT';
`);
