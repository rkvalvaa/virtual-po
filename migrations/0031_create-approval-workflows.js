exports.up = (pgm) => {
  pgm.sql(`
    -- An org-level ordered approval chain. A request in UNDER_REVIEW must be
    -- approved by every step in order before applyDecision('APPROVE') runs.
    CREATE TABLE approval_workflows (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      -- REAL, not NUMERIC: this is compared against feature_requests.priority_score
      -- (also REAL). pg returns NUMERIC as a JS string, which would make the
      -- >= comparison silently wrong.
      auto_approve_min_priority REAL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- getActiveWorkflow() assumes at most one active workflow per org.
    CREATE UNIQUE INDEX idx_approval_workflows_one_active
      ON approval_workflows (organization_id)
      WHERE is_active;

    CREATE TABLE approval_steps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workflow_id UUID NOT NULL REFERENCES approval_workflows(id) ON DELETE CASCADE,
      step_order INT NOT NULL,
      name TEXT NOT NULL,
      approver_role TEXT CHECK (approver_role IN ('REVIEWER', 'ADMIN')),
      -- CASCADE, not SET NULL: SET NULL would leave a step with neither an
      -- approver role nor user, violating approval_steps_one_approver and
      -- making the user delete fail. Dropping the step keeps the chain
      -- completable instead of deadlocking it on a deleted approver.
      approver_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT approval_steps_one_approver CHECK (
        (approver_role IS NULL) <> (approver_user_id IS NULL)
      ),
      UNIQUE (workflow_id, step_order)
    );

    CREATE INDEX idx_approval_steps_workflow
      ON approval_steps (workflow_id, step_order);

    CREATE TABLE request_approvals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id UUID NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
      step_id UUID NOT NULL REFERENCES approval_steps(id) ON DELETE CASCADE,
      approver_id UUID NOT NULL REFERENCES users(id),
      decision TEXT NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED')),
      rationale TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      -- One decision per step per request; also the concurrency guard against
      -- two approvers acting on the same step at once.
      UNIQUE (request_id, step_id)
    );

    CREATE INDEX idx_request_approvals_request
      ON request_approvals (request_id, created_at);

    CREATE TRIGGER trg_approval_workflows_updated_at
      BEFORE UPDATE ON approval_workflows
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_approval_workflows_updated_at ON approval_workflows;
    DROP TABLE IF EXISTS request_approvals;
    DROP TABLE IF EXISTS approval_steps;
    DROP TABLE IF EXISTS approval_workflows;
  `);
};
