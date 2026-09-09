exports.up = (pgm) => pgm.sql(`
  CREATE TABLE workspace_setup_preferences (
    organization_id UUID NOT NULL,
    user_id UUID NOT NULL,
    dismissed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, user_id),
    FOREIGN KEY (organization_id, user_id)
      REFERENCES organization_users(organization_id, user_id)
      ON DELETE CASCADE
  );
`);

exports.down = (pgm) => pgm.sql('DROP TABLE workspace_setup_preferences;');
