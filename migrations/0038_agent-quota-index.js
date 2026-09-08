exports.up = pgm => pgm.sql('CREATE INDEX agent_runs_user_created ON agent_runs(user_id, created_at DESC);');
exports.down = pgm => pgm.sql('DROP INDEX agent_runs_user_created;');
