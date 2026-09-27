import { z } from 'zod';
import { query, transaction } from '@/lib/db/pool';
import { lockOrganizationAdmin } from '@/lib/auth/organization-admin';
import { logActivity } from './activity-log';

export interface ClientContact { id: string; email: string; name: string | null; revokedAt: string | null }
export interface ClientAccount { id: string; name: string; contacts: ClientContact[] }

const accountName = z.string().trim().min(1).max(120);
const contactEmail = z.string().trim().toLowerCase().pipe(z.email());

/** Active (non-archived) accounts with all their contacts, revoked ones included. */
export async function listClientAccounts(orgId: string): Promise<ClientAccount[]> {
  const accounts = await query(`SELECT id, name FROM client_accounts
    WHERE organization_id = $1 AND archived_at IS NULL ORDER BY lower(name)`, [orgId]);
  const contacts = await query(`SELECT c.id, c.client_account_id, c.email, c.name, c.revoked_at FROM client_contacts c
    JOIN client_accounts a ON a.id = c.client_account_id
    WHERE a.organization_id = $1 AND a.archived_at IS NULL ORDER BY c.email`, [orgId]);
  return accounts.rows.map(account => ({
    id: account.id,
    name: account.name,
    contacts: contacts.rows.filter(c => c.client_account_id === account.id).map(c => ({
      id: c.id, email: c.email, name: c.name, revokedAt: c.revoked_at?.toISOString() ?? null,
    })),
  }));
}

export async function createClientAccount(orgId: string, actorId: string, name: string): Promise<{ id: string }> {
  const clean = accountName.parse(name);
  return transaction(async () => {
    await lockOrganizationAdmin(orgId, actorId);
    await assertNameFree(orgId, clean);
    const result = await query(`INSERT INTO client_accounts (organization_id, name, created_by) VALUES ($1, $2, $3) RETURNING id`,
      [orgId, clean, actorId]);
    const id = result.rows[0].id;
    await clientAudit(orgId, actorId, 'account-created', { clientAccountId: id, name: clean });
    return { id };
  });
}

export async function renameClientAccount(orgId: string, actorId: string, id: string, name: string): Promise<void> {
  const clean = accountName.parse(name);
  await transaction(async () => {
    await lockOrganizationAdmin(orgId, actorId);
    await assertNameFree(orgId, clean, id);
    const result = await query(`UPDATE client_accounts SET name = $3, updated_at = NOW()
      WHERE organization_id = $1 AND id = $2 AND archived_at IS NULL`, [orgId, id, clean]);
    if (!result.rowCount) throw new Error('Client not found.');
    await clientAudit(orgId, actorId, 'account-renamed', { clientAccountId: id, name: clean });
  });
}

/** Archiving hides the account; P2 treats its contacts as having no portal access. */
export async function archiveClientAccount(orgId: string, actorId: string, id: string): Promise<void> {
  await transaction(async () => {
    await lockOrganizationAdmin(orgId, actorId);
    const result = await query(`UPDATE client_accounts SET archived_at = NOW(), updated_at = NOW()
      WHERE organization_id = $1 AND id = $2 AND archived_at IS NULL RETURNING name`, [orgId, id]);
    if (!result.rowCount) throw new Error('Client not found.');
    await clientAudit(orgId, actorId, 'account-archived', { clientAccountId: id, name: result.rows[0].name });
  });
}

/** Adds a contact, or restores a revoked one with the same email. */
export async function addClientContact(orgId: string, actorId: string, accountId: string, email: string, name?: string): Promise<{ id: string }> {
  const recipient = contactEmail.parse(email);
  const cleanName = name?.trim() || null;
  return transaction(async () => {
    await lockOrganizationAdmin(orgId, actorId);
    const account = await query(`SELECT id FROM client_accounts
      WHERE organization_id = $1 AND id = $2 AND archived_at IS NULL FOR UPDATE`, [orgId, accountId]);
    if (!account.rowCount) throw new Error('Client not found.');
    const result = await query(`INSERT INTO client_contacts (client_account_id, email, name, created_by) VALUES ($1, $2, $3, $4)
      ON CONFLICT (client_account_id, email) DO UPDATE
        SET revoked_at = NULL, name = COALESCE(EXCLUDED.name, client_contacts.name), updated_at = NOW()
        WHERE client_contacts.revoked_at IS NOT NULL
      RETURNING id`, [accountId, recipient, cleanName, actorId]);
    if (!result.rowCount) throw new Error(`${recipient} is already a contact for this client.`);
    const id = result.rows[0].id;
    await clientAudit(orgId, actorId, 'contact-added', { clientAccountId: accountId, contactId: id, email: recipient });
    return { id };
  });
}

export async function revokeClientContact(orgId: string, actorId: string, contactId: string): Promise<void> {
  await transaction(async () => {
    await lockOrganizationAdmin(orgId, actorId);
    const result = await query(`UPDATE client_contacts c SET revoked_at = NOW(), updated_at = NOW()
      FROM client_accounts a
      WHERE c.id = $2 AND a.id = c.client_account_id AND a.organization_id = $1 AND c.revoked_at IS NULL
      RETURNING c.email, c.client_account_id`, [orgId, contactId]);
    if (!result.rowCount) throw new Error('Contact not found.');
    await clientAudit(orgId, actorId, 'contact-revoked', { clientAccountId: result.rows[0].client_account_id, contactId, email: result.rows[0].email });
  });
}

async function assertNameFree(orgId: string, name: string, exceptId?: string) {
  const clash = await query(`SELECT 1 FROM client_accounts WHERE organization_id = $1 AND lower(name) = lower($2)
    AND archived_at IS NULL AND id IS DISTINCT FROM $3`, [orgId, name, exceptId ?? null]);
  if (clash.rowCount) throw new Error(`A client named "${name}" already exists.`);
}

async function clientAudit(orgId: string, actorId: string, operation: string, details: Record<string, string>) {
  await logActivity({ organizationId: orgId, userId: actorId, action: 'CLIENT_UPDATED', entityType: 'ORGANIZATION', entityId: orgId, metadata: { operation, ...details } });
}
