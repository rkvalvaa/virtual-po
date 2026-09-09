exports.up = pgm => pgm.sql(`
  CREATE TABLE teams_tenants (
    organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (organization_id, tenant_id)
  );

  CREATE TABLE teams_identity_bindings (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    teams_user_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, teams_user_id),
    UNIQUE (organization_id, user_id),
    FOREIGN KEY (organization_id, tenant_id) REFERENCES teams_tenants(organization_id, tenant_id) ON DELETE CASCADE
  );

  CREATE TABLE teams_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    notification_config_id UUID NOT NULL REFERENCES teams_notifications(id) ON DELETE CASCADE,
    activity_id UUID REFERENCES activity_log(id) ON DELETE CASCADE,
    request_id UUID NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    provider_payload JSONB,
    status TEXT NOT NULL CHECK (status IN ('UNAVAILABLE','QUEUED','PROCESSING','ACCEPTED','FAILED','RECONCILIATION_REQUIRED')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    lease_token UUID,
    lease_expires_at TIMESTAMPTZ,
    provider_started_at TIMESTAMPTZ,
    http_status INTEGER,
    error_code TEXT,
    error_message TEXT,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (notification_config_id, activity_id)
  );
  CREATE INDEX teams_deliveries_due ON teams_deliveries(next_attempt_at) WHERE status='QUEUED';
  CREATE INDEX teams_deliveries_org ON teams_deliveries(organization_id, created_at DESC);

  CREATE TABLE teams_command_receipts (
    activity_id TEXT NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    teams_user_id TEXT NOT NULL,
    command TEXT NOT NULL,
    creation_key UUID NOT NULL DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES feature_requests(id) ON DELETE SET NULL,
    response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (organization_id, tenant_id, conversation_id, activity_id),
    FOREIGN KEY (organization_id, tenant_id) REFERENCES teams_tenants(organization_id, tenant_id) ON DELETE CASCADE
  );
`)

exports.down = pgm => pgm.sql(`
  DROP TABLE teams_command_receipts;
  DROP TABLE teams_deliveries;
  DROP TABLE teams_identity_bindings;
  DROP TABLE teams_tenants;
`)
