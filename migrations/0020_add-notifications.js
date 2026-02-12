exports.up = (pgm) => {
  pgm.createTable('notifications', {
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
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    type: {
      type: 'text',
      notNull: true,
    },
    title: {
      type: 'text',
      notNull: true,
    },
    message: {
      type: 'text',
      notNull: true,
    },
    link: {
      type: 'text',
    },
    is_read: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    request_id: {
      type: 'uuid',
      references: 'feature_requests(id)',
      onDelete: 'CASCADE',
    },
    actor_id: {
      type: 'uuid',
      references: 'users(id)',
      onDelete: 'SET NULL',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('notifications', ['user_id', 'is_read']);
  pgm.createIndex('notifications', ['user_id', 'created_at']);
  pgm.createIndex('notifications', 'organization_id');
};

exports.down = (pgm) => {
  pgm.dropTable('notifications');
};
