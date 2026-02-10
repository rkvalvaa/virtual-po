exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id UUID REFERENCES feature_requests(id) ON DELETE CASCADE,
      agent_type TEXT NOT NULL CHECK (agent_type IN ('INTAKE', 'ASSESSMENT', 'OUTPUT', 'GENERAL')),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'ABANDONED')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL')),
      content TEXT NOT NULL,
      tool_calls JSONB,
      tool_results JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_messages_conversation ON messages(conversation_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS conversations;
  `);
};
