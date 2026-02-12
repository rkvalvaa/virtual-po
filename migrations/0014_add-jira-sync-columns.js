exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE feature_requests
      ADD COLUMN jira_issue_key VARCHAR(50),
      ADD COLUMN jira_issue_url TEXT;

    ALTER TABLE epics
      ADD COLUMN jira_epic_key VARCHAR(50),
      ADD COLUMN jira_epic_url TEXT;

    ALTER TABLE user_stories
      ADD COLUMN jira_story_key VARCHAR(50),
      ADD COLUMN jira_story_url TEXT;

    CREATE TABLE jira_sync_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('FEATURE_REQUEST', 'EPIC', 'STORY')),
      entity_id UUID NOT NULL,
      jira_key VARCHAR(50) NOT NULL,
      sync_direction VARCHAR(10) NOT NULL CHECK (sync_direction IN ('PUSH', 'PULL')),
      sync_status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS' CHECK (sync_status IN ('SUCCESS', 'FAILED', 'PENDING')),
      error_message TEXT,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_jira_sync_log_org_entity ON jira_sync_log(organization_id, entity_type, entity_id);

    CREATE UNIQUE INDEX idx_integrations_org_type_active ON integrations(organization_id, type) WHERE is_active = true;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_integrations_org_type_active;
    DROP INDEX IF EXISTS idx_jira_sync_log_org_entity;
    DROP TABLE IF EXISTS jira_sync_log;

    ALTER TABLE user_stories DROP COLUMN IF EXISTS jira_story_key, DROP COLUMN IF EXISTS jira_story_url;
    ALTER TABLE epics DROP COLUMN IF EXISTS jira_epic_key, DROP COLUMN IF EXISTS jira_epic_url;
    ALTER TABLE feature_requests DROP COLUMN IF EXISTS jira_issue_key, DROP COLUMN IF EXISTS jira_issue_url;
  `);
};
