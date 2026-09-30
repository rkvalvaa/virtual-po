import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Integration credentials are stored AES-256-GCM encrypted inside
 * integrations.config. Only these fields are secret; the rest (team ids, base
 * URLs, default projects) stay readable so queries can filter on them.
 */
const SECRET_FIELDS = ['apiKey', 'apiToken', 'botToken', 'signingSecret', 'webhookUrl'] as const;
const PREFIX = 'enc:v1:';

type Config = Record<string, unknown>;

function loadKey(name: 'INTEGRATION_ENCRYPTION_KEY' | 'INTEGRATION_ENCRYPTION_KEY_PREVIOUS'): Buffer | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes, base64-encoded (openssl rand -base64 32).`);
  return key;
}

function currentKey(): Buffer {
  const key = loadKey('INTEGRATION_ENCRYPTION_KEY');
  if (!key) throw new Error('INTEGRATION_ENCRYPTION_KEY is not set; integration credentials cannot be read or stored.');
  return key;
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64');
}

function tryDecrypt(value: string, key: Buffer): string | null {
  const raw = Buffer.from(value.slice(PREFIX.length), 'base64');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(raw.length - 16));
    return Buffer.concat([decipher.update(raw.subarray(12, raw.length - 16)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function secretEntries(config: Config): [string, string][] {
  return SECRET_FIELDS.flatMap((field) => {
    const value = config[field];
    return typeof value === 'string' && value !== '' ? [[field, value] as [string, string]] : [];
  });
}

/** Encrypt the secret fields of a config before it is stored. */
export function encryptConfig(config: Config): Config {
  const secrets = secretEntries(config);
  if (secrets.length === 0) return config;
  const key = currentKey();
  const out = { ...config };
  for (const [field, value] of secrets) out[field] = isEncrypted(value) ? value : encrypt(value, key);
  return out;
}

/**
 * Decrypt a stored config. `stale` means some secret is plaintext (stored
 * before encryption) or under the previous key, so it should be re-encrypted.
 * Fails closed: a secret that neither key opens throws.
 */
export function decryptConfig(config: Config): { config: Config; stale: boolean } {
  const secrets = secretEntries(config);
  if (secrets.length === 0) return { config, stale: false };
  const key = currentKey();
  const previous = loadKey('INTEGRATION_ENCRYPTION_KEY_PREVIOUS');
  const out = { ...config };
  let stale = false;
  for (const [field, value] of secrets) {
    if (!isEncrypted(value)) {
      stale = true;
      continue;
    }
    const plaintext = tryDecrypt(value, key);
    if (plaintext !== null) {
      out[field] = plaintext;
      continue;
    }
    const fallback = previous ? tryDecrypt(value, previous) : null;
    if (fallback === null) {
      throw new Error(`Integration secret "${field}" could not be decrypted with INTEGRATION_ENCRYPTION_KEY or INTEGRATION_ENCRYPTION_KEY_PREVIOUS.`);
    }
    out[field] = fallback;
    stale = true;
  }
  return { config: out, stale };
}
