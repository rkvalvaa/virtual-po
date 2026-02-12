exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE slack_notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      channel_id VARCHAR(50) NOT NULL,
      channel_name VARCHAR(100) NOT NULL,
      event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('REQUEST_CREATED', 'STATUS_CHANGED', 'DECISION_MADE', 'ASSESSMENT_COMPLETE', 'REVIEW_NEEDED')),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_slack_notifications_org_event ON slack_notifications(organization_id, event_type);
    CREATE UNIQUE INDEX idx_slack_notifications_unique ON slack_notifications(organization_id, channel_id, event_type);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_slack_notifications_unique;
    DROP INDEX IF EXISTS idx_slack_notifications_org_event;
    DROP TABLE IF EXISTS slack_notifications;
  `);
};
