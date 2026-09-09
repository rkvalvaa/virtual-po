exports.up = pgm => pgm.sql(`
  CREATE TABLE scoring_policy_versions (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK (version > 0),
    config JSONB NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, version)
  );
`);
exports.down = pgm => pgm.sql('DROP TABLE scoring_policy_versions;');
