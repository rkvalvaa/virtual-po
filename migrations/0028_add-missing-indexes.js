exports.up = (pgm) => {
  pgm.sql(`
    -- comments / decisions / attachments are all queried by request_id
    -- on the request detail page but had no per-table index. Without these,
    -- every detail view performs a sequential scan.
    CREATE INDEX IF NOT EXISTS idx_comments_request
      ON comments (request_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_decisions_request
      ON decisions (request_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_attachments_request
      ON attachments (request_id);

    -- listFeatureRequests / searchFeatureRequests are always org-scoped and
    -- usually filter by status and sort by created_at. The existing single-
    -- column idx_feature_requests_org and idx_feature_requests_status help
    -- in isolation but the planner does better with composites for these
    -- shapes (Postgres rarely combines independent indexes well).
    CREATE INDEX IF NOT EXISTS idx_feature_requests_org_status
      ON feature_requests (organization_id, status);

    CREATE INDEX IF NOT EXISTS idx_feature_requests_org_created
      ON feature_requests (organization_id, created_at DESC);

    -- Per-user-in-org dashboard ("my requests") is hit on every dashboard
    -- load via getUserDashboardStats.
    CREATE INDEX IF NOT EXISTS idx_feature_requests_org_requester
      ON feature_requests (organization_id, requester_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_feature_requests_org_requester;
    DROP INDEX IF EXISTS idx_feature_requests_org_created;
    DROP INDEX IF EXISTS idx_feature_requests_org_status;
    DROP INDEX IF EXISTS idx_attachments_request;
    DROP INDEX IF EXISTS idx_decisions_request;
    DROP INDEX IF EXISTS idx_comments_request;
  `);
};
