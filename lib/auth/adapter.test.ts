// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import pool, { query } from '@/lib/db/pool';
import { hasDb } from '@/test/db-helpers';
import { PgAdapter } from './adapter';

describe.skipIf(!hasDb())('PgAdapter email sign-in support', () => {
  const adapter = PgAdapter(pool);
  const identifier = `link-${crypto.randomUUID()}@client.example`;
  afterAll(async () => {
    await query('DELETE FROM verification_tokens WHERE identifier = $1', [identifier]);
    await query('DELETE FROM users WHERE lower(email) = lower($1)', [`Mixed-${identifier}`]);
  });

  it('stores a verification token and hands it out exactly once', async () => {
    const expires = new Date(Date.now() + 15 * 60_000);
    await adapter.createVerificationToken!({ identifier, token: 'hashed-token', expires });

    const used = await adapter.useVerificationToken!({ identifier, token: 'hashed-token' });
    expect(used).toMatchObject({ identifier, token: 'hashed-token' });
    expect(used!.expires.getTime()).toBe(expires.getTime());
    expect(await adapter.useVerificationToken!({ identifier, token: 'hashed-token' })).toBeNull();
  });

  it('finds an existing user whatever the email case', async () => {
    const created = await adapter.createUser!({ id: '', email: `Mixed-${identifier}`, emailVerified: null });
    const found = await adapter.getUserByEmail!(`mixed-${identifier}`);
    expect(found?.id).toBe(created.id);
  });
});
