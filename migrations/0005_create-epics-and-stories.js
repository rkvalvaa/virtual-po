exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE epics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id UUID UNIQUE REFERENCES feature_requests(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      goals TEXT[] DEFAULT '{}',
      success_criteria TEXT[] DEFAULT '{}',
      technical_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE user_stories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      epic_id UUID REFERENCES epics(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      as_a TEXT NOT NULL,
      i_want TEXT NOT NULL,
      so_that TEXT NOT NULL,
      acceptance_criteria TEXT[] DEFAULT '{}',
      technical_notes TEXT,
      priority INT DEFAULT 0,
      story_points INT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS user_stories;
    DROP TABLE IF EXISTS epics;
  `);
};
