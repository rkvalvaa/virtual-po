exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE decisions ADD COLUMN outcome TEXT CHECK (outcome IN ('CORRECT', 'INCORRECT', 'PARTIALLY_CORRECT', 'PENDING'));
    ALTER TABLE decisions ADD COLUMN outcome_notes TEXT;
    ALTER TABLE decisions ADD COLUMN outcome_recorded_at TIMESTAMPTZ;

    ALTER TABLE feature_requests ADD COLUMN actual_complexity TEXT CHECK (actual_complexity IN ('XS', 'S', 'M', 'L', 'XL'));
    ALTER TABLE feature_requests ADD COLUMN actual_effort_days NUMERIC;
    ALTER TABLE feature_requests ADD COLUMN lessons_learned TEXT;

    CREATE TABLE request_similarities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_request_id UUID NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
      similar_request_id UUID NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
      similarity_score NUMERIC NOT NULL,
      match_reasons JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(source_request_id, similar_request_id)
    );

    CREATE INDEX idx_similarities_source ON request_similarities(source_request_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS request_similarities;

    ALTER TABLE feature_requests DROP COLUMN IF EXISTS actual_complexity;
    ALTER TABLE feature_requests DROP COLUMN IF EXISTS actual_effort_days;
    ALTER TABLE feature_requests DROP COLUMN IF EXISTS lessons_learned;

    ALTER TABLE decisions DROP COLUMN IF EXISTS outcome;
    ALTER TABLE decisions DROP COLUMN IF EXISTS outcome_notes;
    ALTER TABLE decisions DROP COLUMN IF EXISTS outcome_recorded_at;
  `);
};
