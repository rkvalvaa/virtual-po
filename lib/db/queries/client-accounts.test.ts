// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'
import {
  addClientContact,
  archiveClientAccount,
  createClientAccount,
  listClientAccounts,
  renameClientAccount,
  revokeClientContact,
} from './client-accounts'

describe.skipIf(!hasDb())('client accounts and contacts', () => {
  const fixtures: { org: TestOrg; users: string[] }[] = []
  async function setup() {
    const org = await createTestOrg('clients')
    const other = await createTestOrg('clients-other')
    const admin = await createTestUser(org, 'ADMIN')
    const reviewer = await createTestUser(org, 'REVIEWER')
    const otherAdmin = await createTestUser(other, 'ADMIN')
    fixtures.push({ org, users: [admin.id, reviewer.id] }, { org: other, users: [otherAdmin.id] })
    return { org, other, admin, reviewer, otherAdmin }
  }
  afterEach(async () => { for (const { org, users } of fixtures.splice(0)) await cleanupTestOrg(org, users) })

  it('lets an administrator create an account and add a contact without granting membership', async () => {
    const { org, admin } = await setup()
    const account = await createClientAccount(org.id, admin.id, '  Nordic Homes  ')
    await addClientContact(org.id, admin.id, account.id, ' Kari@Nordic.Example ', 'Kari Nordmann')

    const [listed] = await listClientAccounts(org.id)
    expect(listed).toMatchObject({ id: account.id, name: 'Nordic Homes' })
    expect(listed.contacts).toEqual([
      expect.objectContaining({ email: 'kari@nordic.example', name: 'Kari Nordmann', revokedAt: null }),
    ])
    const members = await query(
      `SELECT 1 FROM organization_users ou JOIN users u ON u.id = ou.user_id WHERE u.email = $1`,
      ['kari@nordic.example'],
    )
    expect(members.rowCount).toBe(0)
    const audit = await query(`SELECT metadata FROM activity_log WHERE organization_id = $1 AND action = 'CLIENT_UPDATED'`, [org.id])
    expect(audit.rows.map((row) => row.metadata.operation)).toEqual(expect.arrayContaining(['account-created', 'contact-added']))
  })

  it('refuses non-administrators', async () => {
    const { org, reviewer } = await setup()
    await expect(createClientAccount(org.id, reviewer.id, 'Nordic Homes')).rejects.toThrow(/administrator/i)
  })

  it('refuses every change to another organization\'s clients', async () => {
    const { org, other, admin, otherAdmin } = await setup()
    const account = await createClientAccount(org.id, admin.id, 'Nordic Homes')
    const contact = await addClientContact(org.id, admin.id, account.id, 'kari@nordic.example')

    await expect(renameClientAccount(other.id, otherAdmin.id, account.id, 'Hijacked')).rejects.toThrow(/not found/i)
    await expect(archiveClientAccount(other.id, otherAdmin.id, account.id)).rejects.toThrow(/not found/i)
    await expect(addClientContact(other.id, otherAdmin.id, account.id, 'intruder@example.test')).rejects.toThrow(/not found/i)
    await expect(revokeClientContact(other.id, otherAdmin.id, contact.id)).rejects.toThrow(/not found/i)

    const [listed] = await listClientAccounts(org.id)
    expect(listed.name).toBe('Nordic Homes')
    expect(listed.contacts.map((c) => [c.email, c.revokedAt])).toEqual([['kari@nordic.example', null]])
    expect(await listClientAccounts(other.id)).toEqual([])
  })

  it('refuses a duplicate active contact and restores a revoked one', async () => {
    const { org, admin } = await setup()
    const account = await createClientAccount(org.id, admin.id, 'Nordic Homes')
    const contact = await addClientContact(org.id, admin.id, account.id, 'kari@nordic.example')
    await expect(addClientContact(org.id, admin.id, account.id, 'KARI@nordic.example')).rejects.toThrow(/already/i)

    await revokeClientContact(org.id, admin.id, contact.id)
    expect((await listClientAccounts(org.id))[0].contacts[0].revokedAt).not.toBeNull()

    const restored = await addClientContact(org.id, admin.id, account.id, 'kari@nordic.example')
    expect(restored.id).toBe(contact.id)
    expect((await listClientAccounts(org.id))[0].contacts[0].revokedAt).toBeNull()
  })

  it('hides archived accounts and refuses new contacts on them', async () => {
    const { org, admin } = await setup()
    const account = await createClientAccount(org.id, admin.id, 'Nordic Homes')
    await archiveClientAccount(org.id, admin.id, account.id)

    expect(await listClientAccounts(org.id)).toEqual([])
    await expect(addClientContact(org.id, admin.id, account.id, 'kari@nordic.example')).rejects.toThrow(/not found/i)
  })

  it('refuses a second active account with the same name', async () => {
    const { org, admin } = await setup()
    await createClientAccount(org.id, admin.id, 'Nordic Homes')
    await expect(createClientAccount(org.id, admin.id, 'nordic homes')).rejects.toThrow(/already/i)
  })
})
