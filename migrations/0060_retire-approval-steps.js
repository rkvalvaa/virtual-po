// Editing an approval chain used to delete and re-insert its steps, and the
// cascade wiped every recorded approval (CCT-2447). Steps that approvals
// reference are now retired instead of deleted; only active steps need a
// unique position.
exports.up = pgm => pgm.sql(`
  ALTER TABLE approval_steps
    ADD COLUMN retired_at TIMESTAMPTZ,
    DROP CONSTRAINT approval_steps_workflow_id_step_order_key;
  CREATE UNIQUE INDEX approval_steps_active_order ON approval_steps(workflow_id, step_order) WHERE retired_at IS NULL;
`);
exports.down = pgm => pgm.sql(`
  DELETE FROM approval_steps WHERE retired_at IS NOT NULL;
  DROP INDEX approval_steps_active_order;
  ALTER TABLE approval_steps
    DROP COLUMN retired_at,
    ADD CONSTRAINT approval_steps_workflow_id_step_order_key UNIQUE (workflow_id, step_order);
`);
