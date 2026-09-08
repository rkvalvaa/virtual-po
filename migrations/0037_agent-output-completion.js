exports.up = (pgm) => pgm.sql(`ALTER TABLE agent_runs ADD COLUMN result_complete BOOLEAN NOT NULL DEFAULT false;`);
exports.down = (pgm) => pgm.sql(`ALTER TABLE agent_runs DROP COLUMN result_complete;`);
