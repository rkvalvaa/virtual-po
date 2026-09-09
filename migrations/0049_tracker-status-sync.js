exports.up = pgm => pgm.sql(`
  CREATE TABLE tracker_status_sync_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider = 'LINEAR'),
    destination TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT false,
    mappings JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(mappings) = 'array'),
    checkpoint_at TIMESTAMPTZ,
    last_sync_at TIMESTAMPTZ,
    last_reconciled_at TIMESTAMPTZ,
    last_error TEXT,
    failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count BETWEEN 0 AND 5),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (organization_id, provider, destination)
  );
  CREATE INDEX tracker_status_sync_due
    ON tracker_status_sync_configs (next_attempt_at) WHERE enabled = true;

  CREATE TABLE tracker_status_link_states (
    link_id UUID PRIMARY KEY REFERENCES tracker_import_links(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    last_remote_status_id TEXT,
    last_remote_status_name TEXT,
    last_remote_updated_at TIMESTAMPTZ,
    last_synced_local_status TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
  );
  CREATE INDEX tracker_status_link_states_org ON tracker_status_link_states (organization_id);

  CREATE TABLE tracker_status_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider = 'LINEAR'),
    destination TEXT NOT NULL,
    remote_entity_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    remote_status_id TEXT,
    remote_status_name TEXT,
    mapped_status TEXT,
    remote_updated_at TIMESTAMPTZ,
    outcome TEXT NOT NULL CHECK (outcome IN ('APPLIED', 'SKIPPED', 'CONFLICT', 'FAILED')),
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (organization_id, provider, destination, fingerprint)
  );
  CREATE INDEX tracker_status_events_history
    ON tracker_status_events (organization_id, provider, destination, created_at DESC);

  CREATE TABLE tracker_status_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    link_id UUID NOT NULL REFERENCES tracker_import_links(id) ON DELETE CASCADE,
    request_id UUID NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
    remote_status_id TEXT,
    remote_status_name TEXT NOT NULL,
    mapped_status TEXT NOT NULL,
    local_status TEXT NOT NULL,
    reason TEXT NOT NULL,
    event_fingerprint TEXT NOT NULL,
    resolved_at TIMESTAMPTZ,
    resolution TEXT CHECK (resolution IN ('KEEP_LOCAL', 'APPLY_REMOTE')),
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
  );
  CREATE UNIQUE INDEX tracker_status_conflicts_open
    ON tracker_status_conflicts (link_id) WHERE resolved_at IS NULL;
  CREATE INDEX tracker_status_conflicts_org
    ON tracker_status_conflicts (organization_id, created_at DESC) WHERE resolved_at IS NULL;
`)

exports.down = pgm => pgm.sql(`
  DROP TABLE tracker_status_conflicts;
  DROP TABLE tracker_status_events;
  DROP TABLE tracker_status_link_states;
  DROP TABLE tracker_status_sync_configs;
`)
