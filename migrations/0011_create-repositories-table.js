exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE repositories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      github_repo_id BIGINT NOT NULL,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      full_name TEXT NOT NULL,
      default_branch TEXT NOT NULL DEFAULT 'main',
      is_active BOOLEAN DEFAULT TRUE,
      connected_by UUID REFERENCES users(id),
      connected_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(organization_id, github_repo_id)
    );

    CREATE INDEX idx_repositories_org ON repositories(organization_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS repositories;
  `);
};
