exports.up = (pgm) => {
  pgm.sql(`
    -- Attachments move to Vercel Blob (private). The existing mime_type/size
    -- columns already cover content type and byte size, so only the blob
    -- pathname and the uploader are new.
    ALTER TABLE attachments
      -- Blob pathname (with the random suffix), not the URL: it is what
      -- get()/del() take and it survives a store URL change.
      ADD COLUMN storage_key TEXT,
      -- SET NULL: a deleted user must not take the file's row with them.
      ADD COLUMN uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE attachments
      DROP COLUMN IF EXISTS uploaded_by,
      DROP COLUMN IF EXISTS storage_key;
  `);
};
