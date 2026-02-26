exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE security_reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id UUID NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      categories JSONB NOT NULL DEFAULT '[]',
      overall_severity TEXT NOT NULL DEFAULT 'none' CHECK (overall_severity IN ('critical', 'high', 'medium', 'low', 'none')),
      summary TEXT NOT NULL,
      recommendations TEXT[] DEFAULT '{}',
      requires_security_review BOOLEAN NOT NULL DEFAULT FALSE,
      gaps TEXT[] DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_security_reviews_request ON security_reviews(request_id);
    CREATE INDEX idx_security_reviews_org ON security_reviews(organization_id);
    CREATE INDEX idx_security_reviews_severity ON security_reviews(overall_severity);
    CREATE INDEX idx_security_reviews_requires_review ON security_reviews(requires_security_review) WHERE requires_security_review = TRUE;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS security_reviews;`);
};
