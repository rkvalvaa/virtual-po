exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE feature_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      requester_id UUID REFERENCES users(id),
      assignee_id UUID REFERENCES users(id),
      title TEXT NOT NULL,
      summary TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
        'DRAFT', 'INTAKE_IN_PROGRESS', 'PENDING_ASSESSMENT',
        'UNDER_REVIEW', 'NEEDS_INFO', 'APPROVED', 'REJECTED',
        'DEFERRED', 'IN_BACKLOG', 'IN_PROGRESS', 'COMPLETED'
      )),
      intake_data JSONB DEFAULT '{}',
      intake_complete BOOLEAN DEFAULT FALSE,
      quality_score REAL,
      assessment_data JSONB,
      business_score REAL,
      technical_score REAL,
      risk_score REAL,
      priority_score REAL,
      complexity TEXT CHECK (complexity IN ('XS', 'S', 'M', 'L', 'XL', 'UNKNOWN')),
      tags TEXT[] DEFAULT '{}',
      external_id TEXT,
      external_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_feature_requests_org ON feature_requests(organization_id);
    CREATE INDEX idx_feature_requests_status ON feature_requests(status);
    CREATE INDEX idx_feature_requests_requester ON feature_requests(requester_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS feature_requests;`);
};
