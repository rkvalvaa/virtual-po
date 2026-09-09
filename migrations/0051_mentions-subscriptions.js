exports.up = (pgm) => pgm.sql(`
  ALTER TABLE feature_requests
    ADD CONSTRAINT feature_requests_id_organization_unique
    UNIQUE (id, organization_id);

  CREATE TABLE request_subscriptions (
    organization_id UUID NOT NULL,
    request_id UUID NOT NULL,
    user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (request_id, user_id),
    FOREIGN KEY (request_id, organization_id)
      REFERENCES feature_requests(id, organization_id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id, user_id)
      REFERENCES organization_users(organization_id, user_id) ON DELETE CASCADE
  );

  CREATE INDEX request_subscriptions_organization_user_idx
    ON request_subscriptions(organization_id, user_id);

  CREATE TABLE comment_mentions (
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    mentioned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (comment_id, mentioned_user_id)
  );

  CREATE INDEX comment_mentions_user_idx ON comment_mentions(mentioned_user_id);
`);

exports.down = (pgm) => pgm.sql(`
  DROP TABLE comment_mentions;
  DROP TABLE request_subscriptions;
  ALTER TABLE feature_requests DROP CONSTRAINT feature_requests_id_organization_unique;
`);
