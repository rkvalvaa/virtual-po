exports.up = (pgm) => {
  pgm.createTable('stakeholder_votes', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    request_id: {
      type: 'uuid',
      notNull: true,
      references: 'feature_requests(id)',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    vote_value: {
      type: 'integer',
      notNull: true,
      check: 'vote_value >= 1 AND vote_value <= 5',
    },
    rationale: {
      type: 'text',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // One vote per user per request
  pgm.addConstraint('stakeholder_votes', 'stakeholder_votes_user_request_unique', {
    unique: ['request_id', 'user_id'],
  });

  // Index for fast lookups by request
  pgm.createIndex('stakeholder_votes', 'request_id');

  // Trigger for updated_at
  pgm.sql(`
    CREATE TRIGGER set_stakeholder_votes_updated_at
    BEFORE UPDATE ON stakeholder_votes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('stakeholder_votes');
};
