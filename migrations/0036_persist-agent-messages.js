exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE messages ADD COLUMN client_message_id TEXT,
    ADD COLUMN ui_parts JSONB, ADD COLUMN message_order BIGSERIAL;
    CREATE UNIQUE INDEX messages_client_identity ON messages(conversation_id, client_message_id)
    WHERE client_message_id IS NOT NULL;`);
};
exports.down = (pgm) => {
  pgm.sql(`DROP INDEX messages_client_identity;
    ALTER TABLE messages DROP COLUMN client_message_id, DROP COLUMN ui_parts, DROP COLUMN message_order;`);
};
