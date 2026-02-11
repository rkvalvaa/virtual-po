exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS image TEXT;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE users DROP COLUMN IF EXISTS image;
    ALTER TABLE users DROP COLUMN IF EXISTS email_verified;
  `);
};
