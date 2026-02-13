exports.up = (pgm) => {
  pgm.createTable('activity_log', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    organization_id: {
      type: 'uuid',
      notNull: true,
      references: 'organizations(id)',
      onDelete: 'CASCADE',
    },
    request_id: {
      type: 'uuid',
      references: 'feature_requests(id)',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: 'uuid',
      references: 'users(id)',
      onDelete: 'SET NULL',
    },
    action: {
      type: 'text',
      notNull: true,
    },
    entity_type: {
      type: 'text',
    },
    entity_id: {
      type: 'uuid',
    },
    metadata: {
      type: 'jsonb',
      notNull: true,
      default: pgm.func("'{}'::jsonb"),
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('activity_log', ['request_id', { name: 'created_at', sort: 'DESC' }]);
  pgm.createIndex('activity_log', ['organization_id', { name: 'created_at', sort: 'DESC' }]);
  pgm.createIndex('activity_log', 'user_id');
};

exports.down = (pgm) => {
  pgm.dropTable('activity_log');
};
