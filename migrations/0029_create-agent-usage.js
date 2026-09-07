exports.up = (pgm) => {
  pgm.sql(`
    -- Per-call token/latency accounting for the four agent routes. Written
    -- from streamText's onFinish; read by the analytics dashboard.
    CREATE TABLE agent_usage (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      request_id UUID REFERENCES feature_requests(id) ON DELETE SET NULL,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      agent TEXT NOT NULL CHECK (agent IN ('intake', 'assessment', 'output', 'security')),
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      steps INTEGER NOT NULL,
      finish_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- getAgentUsageSummary is always org-scoped and date-filtered.
    CREATE INDEX idx_agent_usage_org_created
      ON agent_usage (organization_id, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_agent_usage_org_created;
    DROP TABLE IF EXISTS agent_usage;
  `);
};
