exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE feature_requests
      ADD COLUMN linear_issue_id VARCHAR(50),
      ADD COLUMN linear_issue_url TEXT;

    ALTER TABLE epics
      ADD COLUMN linear_project_id VARCHAR(50),
      ADD COLUMN linear_project_url TEXT;

    ALTER TABLE user_stories
      ADD COLUMN linear_issue_id VARCHAR(50),
      ADD COLUMN linear_issue_url TEXT;

    CREATE TABLE linear_sync_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('FEATURE_REQUEST', 'EPIC', 'STORY')),
      entity_id UUID NOT NULL,
      linear_id VARCHAR(50) NOT NULL,
      sync_direction VARCHAR(10) NOT NULL CHECK (sync_direction IN ('PUSH', 'PULL')),
      sync_status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS' CHECK (sync_status IN ('SUCCESS', 'FAILED', 'PENDING')),
      error_message TEXT,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_linear_sync_log_org_entity ON linear_sync_log(organization_id, entity_type, entity_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_linear_sync_log_org_entity;
    DROP TABLE IF EXISTS linear_sync_log;

    ALTER TABLE user_stories DROP COLUMN IF EXISTS linear_issue_id, DROP COLUMN IF EXISTS linear_issue_url;
    ALTER TABLE epics DROP COLUMN IF EXISTS linear_project_id, DROP COLUMN IF EXISTS linear_project_url;
    ALTER TABLE feature_requests DROP COLUMN IF EXISTS linear_issue_id, DROP COLUMN IF EXISTS linear_issue_url;
  `);
};
