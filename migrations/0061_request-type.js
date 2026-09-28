// Request types (CCT-2431). Change requests share feature_requests, so they
// get attachments, comments, activity and export; product-only surfaces
// (queues, planning, analytics, votes, similar-request search, API list) read
// the product_requests view instead.
//
// The view is `SELECT *`, which Postgres expands once, when the view is
// created. A migration that adds a column to feature_requests must re-run the
// CREATE OR REPLACE VIEW below; lib/db/queries/request-type.test.ts fails
// until it does.
exports.up = pgm => pgm.sql(`
  ALTER TABLE feature_requests
    ADD COLUMN request_type TEXT NOT NULL DEFAULT 'PRODUCT'
      CONSTRAINT feature_requests_request_type CHECK (request_type IN ('PRODUCT', 'CHANGE'));
  CREATE OR REPLACE VIEW product_requests AS SELECT * FROM feature_requests WHERE request_type = 'PRODUCT';
`);
exports.down = pgm => pgm.sql(`
  DROP VIEW product_requests;
  ALTER TABLE feature_requests DROP COLUMN request_type;
`);
