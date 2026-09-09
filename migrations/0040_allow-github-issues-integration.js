exports.up = pgm => pgm.sql(`
  ALTER TABLE integrations DROP CONSTRAINT integrations_type_check;
  ALTER TABLE integrations ADD CONSTRAINT integrations_type_check
    CHECK (type IN ('JIRA', 'LINEAR', 'GITHUB', 'GITHUB_ISSUES', 'SLACK', 'TEAMS', 'NOTION', 'CONFLUENCE'));
`);

// Refuse rollback while GitHub Issues integrations exist, preserving their data.
exports.down = pgm => pgm.sql(`
  ALTER TABLE integrations DROP CONSTRAINT integrations_type_check;
  ALTER TABLE integrations ADD CONSTRAINT integrations_type_check
    CHECK (type IN ('JIRA', 'LINEAR', 'GITHUB', 'SLACK', 'TEAMS', 'NOTION', 'CONFLUENCE'));
`);
