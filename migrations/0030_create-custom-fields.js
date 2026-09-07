exports.up = (pgm) => {
  pgm.sql(`
    -- Org-defined extra fields on feature requests. Values live in
    -- feature_requests.custom_fields, keyed by "key" (slug of name).
    CREATE TABLE custom_field_definitions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('TEXT', 'NUMBER', 'SELECT', 'DATE')),
      options JSONB NOT NULL DEFAULT '[]'::jsonb,
      required BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, key)
    );

    -- Definitions are always listed org-scoped in display order.
    CREATE INDEX idx_custom_field_definitions_org_sort
      ON custom_field_definitions (organization_id, sort_order);

    CREATE TRIGGER trg_custom_field_definitions_updated_at
      BEFORE UPDATE ON custom_field_definitions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    ALTER TABLE feature_requests
      ADD COLUMN custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE feature_requests DROP COLUMN IF EXISTS custom_fields;
    DROP TRIGGER IF EXISTS trg_custom_field_definitions_updated_at ON custom_field_definitions;
    DROP INDEX IF EXISTS idx_custom_field_definitions_org_sort;
    DROP TABLE IF EXISTS custom_field_definitions;
  `);
};
