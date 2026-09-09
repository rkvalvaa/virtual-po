exports.up = pgm => pgm.sql(`
  CREATE TABLE tracker_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('LINEAR', 'JIRA', 'GITHUB_ISSUES')),
    destination TEXT NOT NULL,
    items JSONB NOT NULL,
    lease_token UUID,
    lease_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (request_id, provider)
  );
`);
exports.down = pgm => pgm.sql('DROP TABLE tracker_exports;');
