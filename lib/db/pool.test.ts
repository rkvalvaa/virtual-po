import { describe, it, expect, vi } from 'vitest';

vi.mock('pg', () => ({
  Pool: class {
    on() {}
    query() {}
    connect() {}
  },
}));

import { poolConfigFromEnv } from './pool';

describe('poolConfigFromEnv', () => {
  it('should use conservative serverless defaults when nothing is set', () => {
    const cfg = poolConfigFromEnv({ DATABASE_URL: 'postgres://x' });
    expect(cfg).toEqual({
      connectionString: 'postgres://x',
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
  });

  it('should read overrides from env', () => {
    const cfg = poolConfigFromEnv({
      DB_POOL_MAX: '20',
      DB_POOL_IDLE_MS: '30000',
      DB_POOL_CONNECT_TIMEOUT_MS: '2000',
    });
    expect(cfg.max).toBe(20);
    expect(cfg.idleTimeoutMillis).toBe(30_000);
    expect(cfg.connectionTimeoutMillis).toBe(2_000);
  });

  it('should fall back on invalid values instead of passing NaN or 0 to pg', () => {
    const cfg = poolConfigFromEnv({
      DB_POOL_MAX: 'lots',
      DB_POOL_IDLE_MS: '0',
      DB_POOL_CONNECT_TIMEOUT_MS: '-1',
    });
    expect(cfg.max).toBe(5);
    expect(cfg.idleTimeoutMillis).toBe(10_000);
    expect(cfg.connectionTimeoutMillis).toBe(5_000);
  });
});
