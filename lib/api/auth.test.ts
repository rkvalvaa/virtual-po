import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { generateApiKey, hashApiKey, hasScope } from './auth'

describe('generateApiKey', () => {
  it('should return a key, hash, and prefix', () => {
    const { key, hash, prefix } = generateApiKey()
    expect(typeof key).toBe('string')
    expect(typeof hash).toBe('string')
    expect(typeof prefix).toBe('string')
  })

  it('should produce keys with the vpo_ prefix', () => {
    const { key } = generateApiKey()
    expect(key.startsWith('vpo_')).toBe(true)
  })

  it('should produce keys with 32 hex chars after the prefix', () => {
    const { key } = generateApiKey()
    const random = key.slice('vpo_'.length)
    expect(random).toMatch(/^[0-9a-f]{32}$/)
  })

  it('should produce a SHA-256 hex hash of the full key', () => {
    const { key, hash } = generateApiKey()
    const expected = crypto.createHash('sha256').update(key).digest('hex')
    expect(hash).toBe(expected)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('should produce an 8-character prefix matching the start of the key', () => {
    const { key, prefix } = generateApiKey()
    expect(prefix).toBe(key.substring(0, 8))
    expect(prefix.length).toBe(8)
    expect(prefix.startsWith('vpo_')).toBe(true)
  })

  it('should produce unique keys across many invocations', () => {
    const keys = new Set<string>()
    const hashes = new Set<string>()
    for (let i = 0; i < 100; i++) {
      const { key, hash } = generateApiKey()
      keys.add(key)
      hashes.add(hash)
    }
    expect(keys.size).toBe(100)
    expect(hashes.size).toBe(100)
  })
})

describe('hashApiKey', () => {
  it('should compute a SHA-256 hex digest of the input', () => {
    const hash = hashApiKey('vpo_abc123')
    const expected = crypto.createHash('sha256').update('vpo_abc123').digest('hex')
    expect(hash).toBe(expected)
  })

  it('should be deterministic', () => {
    expect(hashApiKey('vpo_xyz')).toBe(hashApiKey('vpo_xyz'))
  })

  it('should produce different hashes for different inputs', () => {
    expect(hashApiKey('vpo_a')).not.toBe(hashApiKey('vpo_b'))
  })

  it('should produce a 64-character hex string', () => {
    expect(hashApiKey('any input')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('should match the hash produced by generateApiKey for the same key', () => {
    const { key, hash } = generateApiKey()
    expect(hashApiKey(key)).toBe(hash)
  })
})

describe('hasScope', () => {
  describe('admin scope', () => {
    it('should grant access to any required scope', () => {
      expect(hasScope(['admin'], 'read')).toBe(true)
      expect(hasScope(['admin'], 'write')).toBe(true)
      expect(hasScope(['admin'], 'admin')).toBe(true)
    })

    it('should grant access to unknown scopes (admin is omnipotent)', () => {
      expect(hasScope(['admin'], 'unknown')).toBe(true)
    })
  })

  describe('write scope', () => {
    it('should grant write access', () => {
      expect(hasScope(['write'], 'write')).toBe(true)
    })

    it('should grant read access (write implies read)', () => {
      expect(hasScope(['write'], 'read')).toBe(true)
    })

    it('should deny admin access', () => {
      expect(hasScope(['write'], 'admin')).toBe(false)
    })
  })

  describe('read scope', () => {
    it('should grant read access', () => {
      expect(hasScope(['read'], 'read')).toBe(true)
    })

    it('should deny write access', () => {
      expect(hasScope(['read'], 'write')).toBe(false)
    })

    it('should deny admin access', () => {
      expect(hasScope(['read'], 'admin')).toBe(false)
    })
  })

  describe('multiple scopes', () => {
    it('should grant access if any scope matches', () => {
      expect(hasScope(['read', 'write'], 'write')).toBe(true)
    })

    it('should grant admin via the admin entry regardless of others', () => {
      expect(hasScope(['read', 'admin'], 'admin')).toBe(true)
    })
  })

  describe('empty or unknown scopes', () => {
    it('should deny everything when scopes is empty', () => {
      expect(hasScope([], 'read')).toBe(false)
      expect(hasScope([], 'write')).toBe(false)
      expect(hasScope([], 'admin')).toBe(false)
    })

    it('should deny access for unknown scope names', () => {
      expect(hasScope(['unknown'], 'read')).toBe(false)
      expect(hasScope(['unknown'], 'write')).toBe(false)
    })
  })
})
