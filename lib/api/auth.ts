import crypto from 'node:crypto';
import { getApiKeyByHash, updateApiKeyLastUsed } from '@/lib/db/queries/api-keys';

const API_KEY_PREFIX = 'vpo_';

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const randomPart = crypto.randomBytes(16).toString('hex'); // 32 hex chars
  const key = `${API_KEY_PREFIX}${randomPart}`;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const prefix = key.substring(0, 8);
  return { key, hash, prefix };
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export async function validateApiKey(
  req: Request
): Promise<{ orgId: string; scopes: string[] } | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const key = authHeader.slice(7);
  if (!key.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  const keyHash = hashApiKey(key);
  const apiKey = await getApiKeyByHash(keyHash);

  if (!apiKey) {
    return null;
  }

  if (!apiKey.isActive) {
    return null;
  }

  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    return null;
  }

  // Fire-and-forget last used update
  updateApiKeyLastUsed(apiKey.id).catch(() => {});

  return {
    orgId: apiKey.organizationId,
    scopes: apiKey.scopes,
  };
}

export function hasScope(scopes: string[], required: string): boolean {
  if (scopes.includes('admin')) return true;
  if (required === 'write' && scopes.includes('write')) return true;
  if (required === 'read' && (scopes.includes('read') || scopes.includes('write'))) return true;
  return false;
}
