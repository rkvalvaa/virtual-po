exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE priority_configs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      framework TEXT NOT NULL,
      weights JSONB NOT NULL,
      is_default BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE integrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('JIRA', 'LINEAR', 'GITHUB', 'SLACK', 'TEAMS', 'NOTION', 'CONFLUENCE')),
      name TEXT NOT NULL,
      config JSONB NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS integrations;
    DROP TABLE IF EXISTS priority_configs;
  `);
};
