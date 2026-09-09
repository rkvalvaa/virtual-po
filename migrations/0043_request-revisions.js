exports.up = pgm => pgm.sql(`
  ALTER TABLE feature_requests ADD COLUMN human_refined BOOLEAN NOT NULL DEFAULT false;
  CREATE TABLE request_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    before_snapshot JSONB NOT NULL,
    after_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX request_revisions_history ON request_revisions(request_id, created_at DESC);
`);
exports.down = pgm => pgm.sql('DROP TABLE request_revisions; ALTER TABLE feature_requests DROP COLUMN human_refined;');
