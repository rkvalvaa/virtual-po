exports.up = pgm => pgm.sql(`
  CREATE TABLE tracker_import_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    request_id UUID NOT NULL UNIQUE REFERENCES feature_requests(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('LINEAR', 'JIRA', 'GITHUB_ISSUES')),
    destination TEXT NOT NULL,
    remote_entity_id TEXT NOT NULL,
    imported_snapshot JSONB NOT NULL,
    pending_snapshot JSONB,
    conflict_fields TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, provider, destination, remote_entity_id)
  );

  CREATE INDEX tracker_import_links_request_org_idx
    ON tracker_import_links (request_id, organization_id);
`);

exports.down = pgm => pgm.sql('DROP TABLE tracker_import_links;');
