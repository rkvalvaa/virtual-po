exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE api_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL,
      scopes TEXT[] NOT NULL DEFAULT '{read}',
      last_used_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_api_keys_org ON api_keys(organization_id);
    CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);

    CREATE TRIGGER trg_api_keys_updated_at
      BEFORE UPDATE ON api_keys
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    CREATE TABLE webhook_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      secret TEXT NOT NULL,
      events TEXT[] NOT NULL DEFAULT '{}',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_triggered_at TIMESTAMPTZ,
      failure_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_webhook_subs_org ON webhook_subscriptions(organization_id);

    CREATE TRIGGER trg_webhook_subscriptions_updated_at
      BEFORE UPDATE ON webhook_subscriptions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_webhook_subscriptions_updated_at ON webhook_subscriptions;
    DROP INDEX IF EXISTS idx_webhook_subs_org;
    DROP TABLE IF EXISTS webhook_subscriptions;

    DROP TRIGGER IF EXISTS trg_api_keys_updated_at ON api_keys;
    DROP INDEX IF EXISTS idx_api_keys_hash;
    DROP INDEX IF EXISTS idx_api_keys_org;
    DROP TABLE IF EXISTS api_keys;
  `);
};
