exports.up = (pgm) => {
  pgm.sql(`
    -- One row per review cycle run: which DEFERRED requests were pushed back
    -- into UNDER_REVIEW, and what triggered the run.
    CREATE TABLE review_cycles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      requeued_count INT NOT NULL,
      -- An id snapshot, not a join table: the set is frozen when the run ends
      -- and is only ever read back whole to compute progress.
      requeued_request_ids UUID[] NOT NULL DEFAULT '{}',
      triggered_by TEXT NOT NULL CHECK (triggered_by IN ('CRON', 'MANUAL')),
      -- SET NULL: a deleted admin must not erase the cycle's history.
      triggered_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
    );

    -- isCycleDue() reads the org's newest cycle; the settings tab lists the
    -- last 10. Both are this index.
    CREATE INDEX idx_review_cycles_org_started
      ON review_cycles (organization_id, started_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS review_cycles;`);
};
