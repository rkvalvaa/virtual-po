// Service groups (CCT-2435): the accountable teams that change requests belong
// to. Members and fallback owners reference organization_users, so only current
// workspace members qualify (client contacts never do). Removing a member drops
// them from their groups. An active group always has a fallback owner; the app
// refuses to remove that member first, and only archived groups lose theirs.
// Group ownership of a request (service_group_id) is separate from assignee_id.
exports.up = pgm => pgm.sql(`
  CREATE TABLE service_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    fallback_owner_id UUID,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, organization_id),
    CONSTRAINT service_groups_owned CHECK (archived_at IS NOT NULL OR fallback_owner_id IS NOT NULL),
    CONSTRAINT service_groups_fallback_owner FOREIGN KEY (organization_id, fallback_owner_id)
      REFERENCES organization_users(organization_id, user_id) ON DELETE SET NULL (fallback_owner_id)
  );
  CREATE UNIQUE INDEX service_groups_active_name ON service_groups (organization_id, lower(btrim(name))) WHERE archived_at IS NULL;
  CREATE TRIGGER trg_service_groups_updated_at BEFORE UPDATE ON service_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at();

  CREATE TABLE service_group_members (
    group_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role TEXT NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('MEMBER', 'LEAD')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id, organization_id) REFERENCES service_groups(id, organization_id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id, user_id) REFERENCES organization_users(organization_id, user_id) ON DELETE CASCADE
  );
  CREATE INDEX service_group_members_user ON service_group_members (organization_id, user_id);

  ALTER TABLE feature_requests
    ADD COLUMN service_group_id UUID,
    ADD CONSTRAINT feature_requests_service_group FOREIGN KEY (service_group_id, organization_id)
      REFERENCES service_groups(id, organization_id);
  CREATE INDEX feature_requests_service_group ON feature_requests (service_group_id) WHERE service_group_id IS NOT NULL;
  CREATE OR REPLACE VIEW product_requests AS SELECT * FROM feature_requests WHERE request_type = 'PRODUCT';
`);
exports.down = pgm => pgm.sql(`
  DROP VIEW product_requests;
  ALTER TABLE feature_requests DROP CONSTRAINT feature_requests_service_group, DROP COLUMN service_group_id;
  DROP TABLE service_group_members;
  DROP TABLE service_groups;
  CREATE VIEW product_requests AS SELECT * FROM feature_requests WHERE request_type = 'PRODUCT';
`);
