exports.up = pgm => pgm.sql(`
  CREATE TABLE organization_ai_budgets (
    organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    monthly_limit_microusd BIGINT NOT NULL CHECK (monthly_limit_microusd > 0),
    warning_percent INTEGER NOT NULL DEFAULT 80 CHECK (warning_percent BETWEEN 1 AND 100),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
  );

  CREATE TABLE agent_budget_ledger (
    run_id UUID PRIMARY KEY REFERENCES agent_runs(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    reserved_microusd BIGINT NOT NULL CHECK (reserved_microusd >= 0),
    settled_microusd BIGINT CHECK (settled_microusd >= 0),
    input_tokens BIGINT CHECK (input_tokens >= 0),
    output_tokens BIGINT CHECK (output_tokens >= 0),
    state TEXT NOT NULL DEFAULT 'RESERVED' CHECK (state IN ('RESERVED', 'MEASURED', 'UNKNOWN')),
    settlement_error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    settled_at TIMESTAMPTZ
  );
  CREATE INDEX agent_budget_ledger_org_window
    ON agent_budget_ledger(organization_id, window_start, state);

  CREATE TABLE organization_ai_budget_alerts (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    window_start TIMESTAMPTZ NOT NULL,
    threshold_percent INTEGER NOT NULL CHECK (threshold_percent BETWEEN 1 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (organization_id, window_start)
  );

  ALTER TABLE agent_usage ADD COLUMN agent_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL;
  CREATE UNIQUE INDEX agent_usage_run_unique ON agent_usage(agent_run_id) WHERE agent_run_id IS NOT NULL;
`);

exports.down = pgm => pgm.sql(`
  DROP INDEX agent_usage_run_unique;
  ALTER TABLE agent_usage DROP COLUMN agent_run_id;
  DROP TABLE organization_ai_budget_alerts;
  DROP TABLE agent_budget_ledger;
  DROP TABLE organization_ai_budgets;
`);
