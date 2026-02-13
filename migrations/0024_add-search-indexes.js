exports.up = (pgm) => {
  // Add tsvector column for full-text search
  pgm.addColumn('feature_requests', {
    search_vector: {
      type: 'tsvector',
    },
  });

  // Create GIN index on the search_vector column
  pgm.createIndex('feature_requests', 'search_vector', {
    method: 'gin',
    name: 'idx_feature_requests_search',
  });

  // Create index on tags for array queries
  pgm.createIndex('feature_requests', 'tags', {
    method: 'gin',
    name: 'idx_feature_requests_tags',
  });

  // Create index on priority_score for range queries
  pgm.createIndex('feature_requests', 'priority_score', {
    name: 'idx_feature_requests_priority',
  });

  // Create trigger to auto-update search_vector on INSERT/UPDATE
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_feature_request_search_vector()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.search_vector := to_tsvector('english',
        coalesce(NEW.title, '') || ' ' || coalesce(NEW.summary, '')
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_feature_requests_search_vector
    BEFORE INSERT OR UPDATE OF title, summary ON feature_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_feature_request_search_vector();
  `);

  // Backfill existing rows
  pgm.sql(`
    UPDATE feature_requests
    SET search_vector = to_tsvector('english',
      coalesce(title, '') || ' ' || coalesce(summary, '')
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_feature_requests_search_vector ON feature_requests;
    DROP FUNCTION IF EXISTS update_feature_request_search_vector();
  `);
  pgm.dropIndex('feature_requests', 'priority_score', { name: 'idx_feature_requests_priority' });
  pgm.dropIndex('feature_requests', 'tags', { name: 'idx_feature_requests_tags' });
  pgm.dropIndex('feature_requests', 'search_vector', { name: 'idx_feature_requests_search' });
  pgm.dropColumns('feature_requests', ['search_vector']);
};
