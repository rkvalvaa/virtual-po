exports.up = pgm => pgm.sql(`
  CREATE TABLE email_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
    recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    recipient_email TEXT NOT NULL,
    recipient_name TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('NOTIFICATION', 'TEST')),
    payload JSONB NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('UNAVAILABLE', 'QUEUED', 'PROCESSING', 'ACCEPTED', 'DELIVERED', 'FAILED', 'RECONCILIATION_REQUIRED')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0,
    manual_retry_count INTEGER NOT NULL DEFAULT 0,
    idempotency_generation INTEGER NOT NULL DEFAULT 1,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    lease_token UUID,
    lease_expires_at TIMESTAMPTZ,
    provider_message_id TEXT,
    provider_payload JSONB,
    first_attempt_at TIMESTAMPTZ,
    idempotency_expires_at TIMESTAMPTZ,
    provider_event_at TIMESTAMPTZ,
    error_code TEXT,
    error_message TEXT,
    accepted_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((kind = 'NOTIFICATION' AND notification_id IS NOT NULL) OR (kind = 'TEST' AND notification_id IS NULL))
  );
  CREATE UNIQUE INDEX email_deliveries_notification ON email_deliveries(notification_id) WHERE notification_id IS NOT NULL;
  CREATE UNIQUE INDEX email_deliveries_provider_message ON email_deliveries(provider_message_id) WHERE provider_message_id IS NOT NULL;
  CREATE INDEX email_deliveries_due ON email_deliveries(next_attempt_at) WHERE status = 'QUEUED';
  CREATE INDEX email_deliveries_organization ON email_deliveries(organization_id, created_at DESC);

  CREATE TABLE email_delivery_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES email_deliveries(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    lease_token UUID NOT NULL UNIQUE,
    provider_idempotency_key TEXT NOT NULL,
    outcome TEXT NOT NULL DEFAULT 'PROCESSING' CHECK (outcome IN ('PROCESSING', 'ACCEPTED', 'FAILED', 'UNKNOWN', 'INTERRUPTED')),
    provider_started_at TIMESTAMPTZ,
    error_code TEXT,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    finished_at TIMESTAMPTZ,
    UNIQUE(delivery_id, attempt_number)
  );

  CREATE TABLE email_provider_events (
    svix_id TEXT PRIMARY KEY,
    provider_message_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    detail TEXT,
    occurred_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    delivery_id UUID REFERENCES email_deliveries(id) ON DELETE SET NULL,
    delivery_reference UUID REFERENCES email_deliveries(id) ON DELETE SET NULL,
    processed_at TIMESTAMPTZ
  );
  CREATE INDEX email_provider_events_message ON email_provider_events(provider_message_id, occurred_at DESC);
`)

exports.down = pgm => pgm.sql(`
  DROP TABLE email_provider_events;
  DROP TABLE email_delivery_attempts;
  DROP TABLE email_deliveries;
`)
