exports.up = pgm => pgm.sql(`
  CREATE TABLE attachment_context (
    attachment_id UUID PRIMARY KEY REFERENCES attachments(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('PENDING','PROCESSED','ERROR')),
    processing_token UUID NOT NULL,
    extracted_text TEXT,
    content_hash TEXT,
    line_count INTEGER,
    source_bytes INTEGER,
    truncated BOOLEAN NOT NULL DEFAULT FALSE,
    error TEXT,
    selected_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);
exports.down = pgm => pgm.sql('DROP TABLE attachment_context');
