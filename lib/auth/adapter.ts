import type { Adapter, AdapterUser, AdapterAccount } from "@auth/core/adapters"
import type { Pool } from "pg"

export function PgAdapter(pool: Pool): Adapter {
  return {
    async createUser(user) {
      const sql = `
        INSERT INTO users (name, email, email_verified, avatar_url)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, email, email_verified AS "emailVerified", avatar_url AS image
      `
      const result = await pool.query(sql, [
        user.name ?? null,
        user.email,
        user.emailVerified ?? null,
        user.image ?? null,
      ])
      return result.rows[0] as AdapterUser
    },

    async getUser(id) {
      const sql = `
        SELECT id, name, email, email_verified AS "emailVerified", avatar_url AS image
        FROM users WHERE id = $1
      `
      const result = await pool.query(sql, [id])
      return (result.rows[0] as AdapterUser) ?? null
    },

    async getUserByEmail(email) {
      const sql = `
        SELECT id, name, email, email_verified AS "emailVerified", avatar_url AS image
        FROM users WHERE email = $1
      `
      const result = await pool.query(sql, [email])
      return (result.rows[0] as AdapterUser) ?? null
    },

    async getUserByAccount({ providerAccountId, provider }) {
      const sql = `
        SELECT u.id, u.name, u.email, u.email_verified AS "emailVerified", u.avatar_url AS image
        FROM users u
        JOIN accounts a ON u.id = a.user_id
        WHERE a.provider = $1 AND a.provider_account_id = $2
      `
      const result = await pool.query(sql, [provider, providerAccountId])
      return (result.rows[0] as AdapterUser) ?? null
    },

    async updateUser(user) {
      const current = await pool.query(
        `SELECT id, name, email, email_verified AS "emailVerified", avatar_url AS image FROM users WHERE id = $1`,
        [user.id]
      )
      const existing = current.rows[0]
      const merged = { ...existing, ...user }

      const sql = `
        UPDATE users
        SET name = $1, email = $2, email_verified = $3, avatar_url = $4, updated_at = NOW()
        WHERE id = $5
        RETURNING id, name, email, email_verified AS "emailVerified", avatar_url AS image
      `
      const result = await pool.query(sql, [
        merged.name,
        merged.email,
        merged.emailVerified ?? null,
        merged.image ?? null,
        merged.id,
      ])
      return result.rows[0] as AdapterUser
    },

    async linkAccount(account) {
      const sql = `
        INSERT INTO accounts (
          user_id, type, provider, provider_account_id,
          refresh_token, access_token, expires_at,
          id_token, scope, session_state, token_type
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `
      await pool.query(sql, [
        account.userId,
        account.type,
        account.provider,
        account.providerAccountId,
        account.refresh_token ?? null,
        account.access_token ?? null,
        account.expires_at ?? null,
        account.id_token ?? null,
        account.scope ?? null,
        account.session_state ?? null,
        account.token_type ?? null,
      ])
      return account as AdapterAccount
    },
  }
}
