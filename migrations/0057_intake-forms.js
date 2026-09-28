// Request forms published to a client (CCT-2080). `draft` is what admins edit;
// `published` is the frozen copy the portal serves, replaced only by publishing.
exports.up = pgm => pgm.sql(`
  CREATE TABLE intake_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_account_id UUID NOT NULL,
    draft JSONB NOT NULL,
    published JSONB,
    version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'PAUSED')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    published_by UUID REFERENCES users(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (client_account_id, organization_id) REFERENCES client_accounts(id, organization_id) ON DELETE CASCADE,
    CHECK ((status = 'DRAFT') = (published IS NULL))
  );
  CREATE INDEX intake_forms_org ON intake_forms(organization_id);
`);
exports.down = pgm => pgm.sql('DROP TABLE intake_forms;');
