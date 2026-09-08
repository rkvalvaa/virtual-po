exports.up = pgm => pgm.sql(`
  CREATE TABLE webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
  );
  CREATE TABLE webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES webhook_events(id) ON DELETE CASCADE,
    subscription_id UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
    is_test BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','SUCCEEDED','FAILED')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    lease_token UUID,
    lease_expires_at TIMESTAMPTZ,
    http_status INTEGER,
    error_code TEXT,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(event_id, subscription_id)
  );
  CREATE INDEX webhook_deliveries_due ON webhook_deliveries(next_attempt_at) WHERE status = 'PENDING';
  CREATE INDEX webhook_deliveries_subscription ON webhook_deliveries(subscription_id, created_at DESC);
  CREATE TABLE webhook_delivery_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES webhook_deliveries(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    lease_token UUID NOT NULL UNIQUE,
    outcome TEXT NOT NULL DEFAULT 'RUNNING' CHECK (outcome IN ('RUNNING','SUCCEEDED','FAILED','INTERRUPTED')),
    http_status INTEGER,
    error_code TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    finished_at TIMESTAMPTZ,
    UNIQUE(delivery_id, attempt_number)
  );

  CREATE FUNCTION enqueue_webhook_event(org UUID, kind TEXT, payload JSONB) RETURNS UUID LANGUAGE plpgsql AS $$
  DECLARE event_uuid UUID := gen_random_uuid();
  BEGIN
    IF NOT EXISTS(SELECT 1 FROM webhook_subscriptions WHERE organization_id = org AND is_active AND kind = ANY(events)) THEN RETURN NULL; END IF;
    INSERT INTO webhook_events(id, organization_id, event_type, body)
      VALUES(event_uuid, org, kind, jsonb_build_object('id', event_uuid, 'event', kind, 'payload', payload, 'timestamp', clock_timestamp())::text);
    INSERT INTO webhook_deliveries(event_id, subscription_id)
      SELECT event_uuid, id FROM webhook_subscriptions WHERE organization_id = org AND is_active AND kind = ANY(events);
    RETURN event_uuid;
  END $$;

  CREATE FUNCTION capture_request_webhooks() RETURNS TRIGGER LANGUAGE plpgsql AS $$
  DECLARE changed_fields JSONB;
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM enqueue_webhook_event(NEW.organization_id, 'request.created', jsonb_build_object('requestId', NEW.id, 'title', NEW.title, 'status', NEW.status));
    ELSE
      SELECT jsonb_agg(key) INTO changed_fields FROM jsonb_each(to_jsonb(NEW))
        WHERE key <> 'updated_at' AND value IS DISTINCT FROM to_jsonb(OLD)->key;
      IF changed_fields IS NOT NULL THEN
        PERFORM enqueue_webhook_event(NEW.organization_id, 'request.updated', jsonb_build_object('requestId', NEW.id, 'updatedFields', changed_fields));
      END IF;
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        PERFORM enqueue_webhook_event(NEW.organization_id, 'request.status_changed', jsonb_build_object('requestId', NEW.id, 'previousStatus', OLD.status, 'newStatus', NEW.status));
      END IF;
      IF NEW.assessment_data IS NOT NULL AND NEW.assessment_data IS DISTINCT FROM OLD.assessment_data THEN
        PERFORM enqueue_webhook_event(NEW.organization_id, 'assessment.completed', jsonb_build_object('requestId', NEW.id, 'priorityScore', NEW.priority_score));
      END IF;
    END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER request_webhook_outbox AFTER INSERT OR UPDATE ON feature_requests FOR EACH ROW EXECUTE FUNCTION capture_request_webhooks();

  CREATE FUNCTION capture_artifact_webhooks() RETURNS TRIGGER LANGUAGE plpgsql AS $$
  DECLARE org UUID; req UUID; kind TEXT; payload JSONB;
  BEGIN
    IF TG_TABLE_NAME = 'user_stories' THEN
      SELECT r.organization_id, r.id INTO org, req FROM epics e JOIN feature_requests r ON r.id=e.request_id WHERE e.id=NEW.epic_id;
      kind := 'story.created'; payload := jsonb_build_object('requestId', req, 'epicId', NEW.epic_id, 'storyId', NEW.id, 'title', NEW.title);
    ELSE
      SELECT organization_id INTO org FROM feature_requests WHERE id=NEW.request_id;
      req := NEW.request_id;
      IF TG_TABLE_NAME = 'epics' THEN kind := 'epic.created'; payload := jsonb_build_object('requestId', req, 'epicId', NEW.id, 'title', NEW.title);
      ELSIF TG_TABLE_NAME = 'decisions' THEN kind := 'decision.made'; payload := jsonb_build_object('requestId', req, 'decisionId', NEW.id, 'decision', NEW.decision);
      ELSE kind := 'security_review.completed'; payload := jsonb_build_object('requestId', req, 'securityReviewId', NEW.id); END IF;
    END IF;
    PERFORM enqueue_webhook_event(org, kind, payload);
    RETURN NEW;
  END $$;
  CREATE TRIGGER epic_webhook_outbox AFTER INSERT ON epics FOR EACH ROW EXECUTE FUNCTION capture_artifact_webhooks();
  CREATE TRIGGER story_webhook_outbox AFTER INSERT ON user_stories FOR EACH ROW EXECUTE FUNCTION capture_artifact_webhooks();
  CREATE TRIGGER decision_webhook_outbox AFTER INSERT ON decisions FOR EACH ROW EXECUTE FUNCTION capture_artifact_webhooks();
  CREATE TRIGGER security_webhook_outbox AFTER INSERT ON security_reviews FOR EACH ROW EXECUTE FUNCTION capture_artifact_webhooks();
`);
exports.down = pgm => pgm.sql(`
  DROP TRIGGER security_webhook_outbox ON security_reviews;
  DROP TRIGGER decision_webhook_outbox ON decisions;
  DROP TRIGGER story_webhook_outbox ON user_stories;
  DROP TRIGGER epic_webhook_outbox ON epics;
  DROP TRIGGER request_webhook_outbox ON feature_requests;
  DROP FUNCTION capture_artifact_webhooks(); DROP FUNCTION capture_request_webhooks(); DROP FUNCTION enqueue_webhook_event(UUID,TEXT,JSONB);
  DROP TABLE webhook_delivery_attempts; DROP TABLE webhook_deliveries; DROP TABLE webhook_events;
`);
