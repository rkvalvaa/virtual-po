exports.up = pgm => pgm.sql(`
  ALTER TABLE feature_requests
    ADD COLUMN planning_commitment TEXT CHECK (planning_commitment IN ('NOW','NEXT','LATER')),
    ADD COLUMN target_period TEXT CHECK (target_period IS NULL OR target_period ~ '^[0-9]{4}-Q[1-4]$'),
    ADD COLUMN manual_rank INTEGER CHECK (manual_rank IS NULL OR manual_rank BETWEEN 1 AND 100000),
    ADD COLUMN planning_objective_id UUID REFERENCES objectives(id) ON DELETE SET NULL,
    ADD COLUMN planned_effort_days NUMERIC(10,2) CHECK (planned_effort_days IS NULL OR planned_effort_days BETWEEN 0 AND 100000),
    ADD COLUMN planning_version INTEGER NOT NULL DEFAULT 0;

  CREATE INDEX feature_requests_planning_idx
    ON feature_requests(organization_id, planning_commitment, target_period, manual_rank);
  CREATE INDEX feature_requests_planning_objective_idx
    ON feature_requests(planning_objective_id)
    WHERE planning_objective_id IS NOT NULL;

  ALTER TABLE team_capacity
    ADD COLUMN allocation_reconciliation TEXT CHECK (allocation_reconciliation IN ('REPLACED_BY_REQUESTS','RETAINED_AS_OUTSIDE_WORK')),
    ADD COLUMN allocation_reconciled_at TIMESTAMPTZ,
    ADD COLUMN allocation_reconciled_by UUID REFERENCES users(id) ON DELETE SET NULL;

  CREATE TABLE request_planning_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    request_id UUID REFERENCES feature_requests(id) ON DELETE CASCADE,
    quarter TEXT,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_kind TEXT NOT NULL CHECK (event_kind IN ('REQUEST_UPDATED','CAPACITY_RECONCILED')),
    changes JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
      (event_kind = 'REQUEST_UPDATED' AND request_id IS NOT NULL AND quarter IS NULL)
      OR (event_kind = 'CAPACITY_RECONCILED' AND request_id IS NULL AND quarter ~ '^[0-9]{4}-Q[1-4]$')
    )
  );
  CREATE INDEX request_planning_events_request_idx
    ON request_planning_events(request_id, created_at DESC)
    WHERE request_id IS NOT NULL;
  CREATE INDEX request_planning_events_org_idx
    ON request_planning_events(organization_id, created_at DESC);
`);

exports.down = pgm => pgm.sql(`
  DROP TABLE request_planning_events;
  ALTER TABLE team_capacity
    DROP COLUMN allocation_reconciled_by,
    DROP COLUMN allocation_reconciled_at,
    DROP COLUMN allocation_reconciliation;
  DROP INDEX feature_requests_planning_objective_idx;
  DROP INDEX feature_requests_planning_idx;
  ALTER TABLE feature_requests
    DROP COLUMN planning_version,
    DROP COLUMN planned_effort_days,
    DROP COLUMN planning_objective_id,
    DROP COLUMN manual_rank,
    DROP COLUMN target_period,
    DROP COLUMN planning_commitment;
`);
