exports.up = (pgm) => {
  pgm.addColumn('users', {
    preferred_organization_id: {
      type: 'uuid',
      references: 'organizations(id)',
      onDelete: 'SET NULL',
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('users', 'preferred_organization_id');
};
