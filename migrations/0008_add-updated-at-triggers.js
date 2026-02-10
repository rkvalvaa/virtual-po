exports.up = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_organizations_updated_at
      BEFORE UPDATE ON organizations
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    CREATE TRIGGER trg_users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    CREATE TRIGGER trg_feature_requests_updated_at
      BEFORE UPDATE ON feature_requests
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    CREATE TRIGGER trg_conversations_updated_at
      BEFORE UPDATE ON conversations
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    CREATE TRIGGER trg_epics_updated_at
      BEFORE UPDATE ON epics
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    CREATE TRIGGER trg_user_stories_updated_at
      BEFORE UPDATE ON user_stories
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    CREATE TRIGGER trg_comments_updated_at
      BEFORE UPDATE ON comments
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    CREATE TRIGGER trg_priority_configs_updated_at
      BEFORE UPDATE ON priority_configs
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    CREATE TRIGGER trg_integrations_updated_at
      BEFORE UPDATE ON integrations
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_integrations_updated_at ON integrations;
    DROP TRIGGER IF EXISTS trg_priority_configs_updated_at ON priority_configs;
    DROP TRIGGER IF EXISTS trg_comments_updated_at ON comments;
    DROP TRIGGER IF EXISTS trg_user_stories_updated_at ON user_stories;
    DROP TRIGGER IF EXISTS trg_epics_updated_at ON epics;
    DROP TRIGGER IF EXISTS trg_conversations_updated_at ON conversations;
    DROP TRIGGER IF EXISTS trg_feature_requests_updated_at ON feature_requests;
    DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
    DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations;
    DROP FUNCTION IF EXISTS update_updated_at();
  `);
};
