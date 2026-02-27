exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE teams_notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      channel_name VARCHAR(255) NOT NULL,
      webhook_url TEXT NOT NULL,
      event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
        'REQUEST_CREATED', 'STATUS_CHANGED', 'DECISION_MADE',
        'ASSESSMENT_COMPLETE', 'REVIEW_NEEDED'
      )),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_teams_notifications_org ON teams_notifications(organization_id);
    CREATE UNIQUE INDEX idx_teams_notifications_unique ON teams_notifications(organization_id, webhook_url, event_type);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_teams_notifications_unique;
    DROP INDEX IF EXISTS idx_teams_notifications_org;
    DROP TABLE IF EXISTS teams_notifications;
  `);
};
