exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE feature_requests
      ADD COLUMN github_issue_number INTEGER,
      ADD COLUMN github_issue_url TEXT;

    ALTER TABLE epics
      ADD COLUMN github_issue_number INTEGER,
      ADD COLUMN github_issue_url TEXT;

    ALTER TABLE user_stories
      ADD COLUMN github_issue_number INTEGER,
      ADD COLUMN github_issue_url TEXT;

    CREATE TABLE github_sync_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('FEATURE_REQUEST', 'EPIC', 'STORY')),
      entity_id UUID NOT NULL,
      github_issue_number INTEGER,
      sync_direction VARCHAR(10) NOT NULL CHECK (sync_direction IN ('PUSH', 'PULL')),
      sync_status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS' CHECK (sync_status IN ('SUCCESS', 'FAILED', 'PENDING')),
      error_message TEXT,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_github_sync_log_org_synced ON github_sync_log(organization_id, synced_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_github_sync_log_org_synced;
    DROP TABLE IF EXISTS github_sync_log;

    ALTER TABLE user_stories DROP COLUMN IF EXISTS github_issue_number, DROP COLUMN IF EXISTS github_issue_url;
    ALTER TABLE epics DROP COLUMN IF EXISTS github_issue_number, DROP COLUMN IF EXISTS github_issue_url;
    ALTER TABLE feature_requests DROP COLUMN IF EXISTS github_issue_number, DROP COLUMN IF EXISTS github_issue_url;
  `);
};
