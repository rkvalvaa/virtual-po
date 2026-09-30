// @vitest-environment node
import { randomBytes } from 'crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decryptConfig, encryptConfig, isEncrypted } from './integration-secrets';

const KEY = randomBytes(32).toString('base64');
const OTHER_KEY = randomBytes(32).toString('base64');

describe('integration secret encryption', () => {
  const saved = { current: process.env.INTEGRATION_ENCRYPTION_KEY, previous: process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS };
  beforeEach(() => {
    process.env.INTEGRATION_ENCRYPTION_KEY = KEY;
    delete process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS;
  });
  afterEach(() => {
    process.env.INTEGRATION_ENCRYPTION_KEY = saved.current;
    if (saved.previous === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS;
    else process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS = saved.previous;
  });

  it('should encrypt only secret fields and round-trip them', () => {
    const stored = encryptConfig({ apiKey: 'lin_secret', defaultTeamId: 'team-1' });

    expect(isEncrypted(stored.apiKey)).toBe(true);
    expect(JSON.stringify(stored)).not.toContain('lin_secret');
    expect(stored.defaultTeamId).toBe('team-1');
    expect(decryptConfig(stored)).toEqual({ config: { apiKey: 'lin_secret', defaultTeamId: 'team-1' }, stale: false });
  });

  it('should read a legacy plaintext secret and flag it for re-encryption', () => {
    expect(decryptConfig({ botToken: 'xoxb-plain', teamId: 'T1' })).toEqual({ config: { botToken: 'xoxb-plain', teamId: 'T1' }, stale: true });
  });

  it('should decrypt with the previous key after rotation and flag it as stale', () => {
    const stored = encryptConfig({ apiToken: 'jira-token' });
    process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS = KEY;
    process.env.INTEGRATION_ENCRYPTION_KEY = OTHER_KEY;

    expect(decryptConfig(stored)).toEqual({ config: { apiToken: 'jira-token' }, stale: true });
  });

  it('should fail closed with a clear error when the key is wrong', () => {
    const stored = encryptConfig({ apiKey: 'lin_secret' });
    process.env.INTEGRATION_ENCRYPTION_KEY = OTHER_KEY;

    expect(() => decryptConfig(stored)).toThrow(/INTEGRATION_ENCRYPTION_KEY/);
  });

  it('should fail closed when the key is missing or malformed', () => {
    delete process.env.INTEGRATION_ENCRYPTION_KEY;
    expect(() => encryptConfig({ apiKey: 'x' })).toThrow(/INTEGRATION_ENCRYPTION_KEY is not set/);
    expect(() => decryptConfig({ apiKey: 'plain' })).toThrow(/INTEGRATION_ENCRYPTION_KEY is not set/);

    process.env.INTEGRATION_ENCRYPTION_KEY = 'too-short';
    expect(() => encryptConfig({ apiKey: 'x' })).toThrow(/32 bytes/);
  });

  it('should need no key for a config without secrets', () => {
    delete process.env.INTEGRATION_ENCRYPTION_KEY;
    expect(decryptConfig({ defaultRepo: 'org/repo' })).toEqual({ config: { defaultRepo: 'org/repo' }, stale: false });
    expect(encryptConfig({ defaultRepo: 'org/repo' })).toEqual({ defaultRepo: 'org/repo' });
  });
});
