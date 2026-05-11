exports.up = (pgm) => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    -- GIN trigram index over feature_requests.title to make similarity() queries cheap.
    -- Used by findSimilarRequests for duplicate detection on the new-request flow.
    CREATE INDEX IF NOT EXISTS feature_requests_title_trgm_idx
      ON feature_requests
      USING gin (title gin_trgm_ops);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS feature_requests_title_trgm_idx;
  `);
};
