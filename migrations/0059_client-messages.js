// Requester-visible messages on portal requests (CCT-2089). A separate table,
// not a flag on comments: a shared stream with a visibility flag leaks.
exports.up = pgm => pgm.sql(`
  CREATE TABLE request_external_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('TO_CLIENT', 'FROM_CLIENT')),
    author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    author_contact_id UUID REFERENCES client_contacts(id) ON DELETE SET NULL,
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (request_id, organization_id) REFERENCES feature_requests(id, organization_id) ON DELETE CASCADE
  );
  CREATE INDEX request_external_messages_request ON request_external_messages(request_id, created_at);

  ALTER TABLE email_deliveries
    ADD COLUMN external_message_id UUID REFERENCES request_external_messages(id) ON DELETE CASCADE,
    DROP CONSTRAINT email_deliveries_kind_check,
    DROP CONSTRAINT email_deliveries_check,
    ADD CONSTRAINT email_deliveries_kind_check CHECK (kind IN ('NOTIFICATION', 'TEST', 'CLIENT_MESSAGE')),
    ADD CONSTRAINT email_deliveries_check CHECK (
      (kind = 'NOTIFICATION' AND notification_id IS NOT NULL AND external_message_id IS NULL) OR
      (kind = 'TEST' AND notification_id IS NULL AND external_message_id IS NULL) OR
      (kind = 'CLIENT_MESSAGE' AND notification_id IS NULL AND external_message_id IS NOT NULL));
  CREATE UNIQUE INDEX email_deliveries_external_message ON email_deliveries(external_message_id) WHERE external_message_id IS NOT NULL;
`);
exports.down = pgm => pgm.sql(`
  DELETE FROM email_deliveries WHERE kind = 'CLIENT_MESSAGE';
  ALTER TABLE email_deliveries
    DROP CONSTRAINT email_deliveries_check,
    DROP CONSTRAINT email_deliveries_kind_check,
    DROP COLUMN external_message_id,
    ADD CONSTRAINT email_deliveries_kind_check CHECK (kind IN ('NOTIFICATION', 'TEST')),
    ADD CONSTRAINT email_deliveries_check CHECK ((kind = 'NOTIFICATION' AND notification_id IS NOT NULL) OR (kind = 'TEST' AND notification_id IS NULL));
  DROP TABLE request_external_messages;
`);
