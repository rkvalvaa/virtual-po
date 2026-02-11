exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE objectives (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      time_frame VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_objectives_org_status ON objectives(organization_id, status);

    CREATE TABLE key_results (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      objective_id UUID NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
      title VARCHAR(500) NOT NULL,
      target_value NUMERIC NOT NULL DEFAULT 100,
      current_value NUMERIC NOT NULL DEFAULT 0,
      unit VARCHAR(50) NOT NULL DEFAULT '%',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE team_capacity (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      quarter VARCHAR(10) NOT NULL,
      total_capacity_days NUMERIC NOT NULL DEFAULT 0,
      allocated_days NUMERIC NOT NULL DEFAULT 0,
      notes TEXT,
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(organization_id, quarter)
    );

    CREATE TRIGGER set_objectives_updated_at
      BEFORE UPDATE ON objectives
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    CREATE TRIGGER set_key_results_updated_at
      BEFORE UPDATE ON key_results
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    CREATE TRIGGER set_team_capacity_updated_at
      BEFORE UPDATE ON team_capacity
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS set_team_capacity_updated_at ON team_capacity;
    DROP TRIGGER IF EXISTS set_key_results_updated_at ON key_results;
    DROP TRIGGER IF EXISTS set_objectives_updated_at ON objectives;

    DROP TABLE IF EXISTS team_capacity;
    DROP TABLE IF EXISTS key_results;
    DROP TABLE IF EXISTS objectives;
  `);
};
