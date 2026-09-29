// Change-request delivery to Linear (CCT-2441). An internal form may name a
// Linear destination (server-owned, validated on save). Each change request it
// files is queued as a tracker export that a cron delivers with bounded
// retries. User-run exports keep delivery_status NULL.
exports.up = pgm => pgm.sql(`
  ALTER TABLE intake_forms
    ADD COLUMN destination JSONB,
    ADD CONSTRAINT intake_forms_destination CHECK (destination IS NULL OR audience = 'INTERNAL');
  ALTER TABLE tracker_exports
    ADD COLUMN delivery_status TEXT CHECK (delivery_status IN ('QUEUED', 'DELIVERED', 'NEEDS_ATTENTION', 'FAILED')),
    ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN next_attempt_at TIMESTAMPTZ,
    ADD COLUMN last_error TEXT;
  CREATE INDEX tracker_exports_due ON tracker_exports (next_attempt_at) WHERE delivery_status = 'QUEUED';
`);
exports.down = pgm => pgm.sql(`
  DROP INDEX tracker_exports_due;
  ALTER TABLE tracker_exports DROP COLUMN last_error, DROP COLUMN next_attempt_at, DROP COLUMN attempts, DROP COLUMN delivery_status;
  ALTER TABLE intake_forms DROP CONSTRAINT intake_forms_destination, DROP COLUMN destination;
`);
