exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE agent_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id UUID NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      agent TEXT NOT NULL CHECK (agent IN ('intake', 'assessment', 'output', 'security')),
      status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '3 minutes',
      finished_at TIMESTAMPTZ,
      error_code TEXT
    );
    CREATE UNIQUE INDEX agent_runs_one_running_request ON agent_runs(request_id) WHERE status = 'RUNNING';
    CREATE INDEX agent_runs_org_created ON agent_runs(organization_id, created_at DESC);
    CREATE INDEX agent_runs_request_created ON agent_runs(request_id, created_at DESC);
  `);
};
exports.down = (pgm) => { pgm.sql('DROP TABLE agent_runs;'); };
