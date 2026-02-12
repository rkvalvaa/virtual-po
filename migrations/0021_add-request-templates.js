exports.up = (pgm) => {
  pgm.createTable('request_templates', {
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
    name: {
      type: 'text',
      notNull: true,
    },
    description: {
      type: 'text',
    },
    category: {
      type: 'text',
      notNull: true,
    },
    icon: {
      type: 'text',
    },
    default_title: {
      type: 'text',
    },
    prompt_hints: {
      type: 'jsonb',
      default: "'[]'::jsonb",
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    sort_order: {
      type: 'integer',
      notNull: true,
      default: 0,
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

  pgm.createIndex('request_templates', ['organization_id', 'is_active']);

  pgm.sql(`
    CREATE TRIGGER trg_request_templates_updated_at
    BEFORE UPDATE ON request_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('request_templates');
};
