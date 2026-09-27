// Client accounts and their contacts are deliberately separate from
// organization_users: a contact never gets an internal role (CCT-2081).
exports.up = pgm => pgm.sql(`
  CREATE TABLE client_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120 AND name = btrim(name)),
    archived_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, organization_id)
  );
  CREATE UNIQUE INDEX client_accounts_active_name ON client_accounts(organization_id, lower(name))
    WHERE archived_at IS NULL;

  CREATE TABLE client_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
    email TEXT NOT NULL CHECK (email = lower(btrim(email)) AND email <> ''),
    name TEXT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ,
    last_invited_at TIMESTAMPTZ,
    invite_delivery_status TEXT CHECK (invite_delivery_status IN ('PENDING', 'SENT', 'FAILED')),
    invite_delivery_error TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (client_account_id, email)
  );
`);
exports.down = pgm => pgm.sql('DROP TABLE client_contacts; DROP TABLE client_accounts;');
