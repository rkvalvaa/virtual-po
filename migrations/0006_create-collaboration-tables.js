exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id UUID REFERENCES feature_requests(id) ON DELETE CASCADE,
      author_id UUID REFERENCES users(id),
      content TEXT NOT NULL,
      parent_id UUID REFERENCES comments(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE decisions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id UUID REFERENCES feature_requests(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id),
      decision TEXT NOT NULL CHECK (decision IN ('APPROVE', 'REJECT', 'DEFER', 'REQUEST_INFO')),
      rationale TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id UUID REFERENCES feature_requests(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INT NOT NULL,
      url TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS attachments;
    DROP TABLE IF EXISTS decisions;
    DROP TABLE IF EXISTS comments;
  `);
};
