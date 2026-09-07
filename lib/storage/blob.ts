import { put, get, del } from '@vercel/blob';
import { sanitizeFilename } from '@/lib/storage/validate';
import { log } from '@/lib/logging/logger';

/**
 * Attachment storage on Vercel Blob. Every blob is private: the only way to
 * read one back is the authenticated download route, which streams it through
 * `readAttachment`. Nothing here trusts its inputs — callers must run
 * `validateAttachment` first.
 */

/**
 * The SDK reads BLOB_READ_WRITE_TOKEN itself and throws a generic error when
 * it is missing. Check up front so callers can return a clear message.
 */
export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export class BlobNotConfiguredError extends Error {
  constructor() {
    super('File storage is not configured');
    this.name = 'BlobNotConfiguredError';
  }
}

function assertConfigured(): void {
  if (!isBlobConfigured()) throw new BlobNotConfiguredError();
}

export interface UploadedAttachment {
  /** Blob pathname including the random suffix — the handle for get/del. */
  storageKey: string;
  url: string;
  contentType: string;
  size: number;
}

/**
 * Store one file. The pathname is org- and request-scoped so a listing of the
 * store is readable and a whole request's files share a prefix.
 */
export async function uploadAttachment(params: {
  orgId: string;
  requestId: string;
  file: File;
}): Promise<UploadedAttachment> {
  assertConfigured();
  const { orgId, requestId, file } = params;
  const filename = sanitizeFilename(file.name);

  const result = await put(
    `orgs/${orgId}/requests/${requestId}/${filename}`,
    file,
    {
      access: 'private',
      // Two uploads of "screenshot.png" must not collide or overwrite.
      addRandomSuffix: true,
      contentType: file.type,
    }
  );

  return {
    storageKey: result.pathname,
    url: result.url,
    contentType: result.contentType,
    size: file.size,
  };
}

export interface AttachmentStream {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  size: number;
}

/**
 * Read a private blob back as a stream. Returns null when the blob is gone —
 * the row can outlive the file if a delete half-failed.
 */
export async function readAttachment(
  storageKey: string
): Promise<AttachmentStream | null> {
  assertConfigured();
  const result = await get(storageKey, { access: 'private' });
  // 304 is only reachable with ifNoneMatch, which we never send.
  if (!result || result.statusCode !== 200) return null;
  return {
    stream: result.stream,
    contentType: result.blob.contentType,
    size: result.blob.size,
  };
}

/**
 * Best-effort delete. The row is the source of truth, so an orphaned blob is
 * logged rather than surfaced to the user.
 */
export async function deleteAttachment(storageKey: string): Promise<void> {
  if (!isBlobConfigured()) return;
  try {
    await del(storageKey);
  } catch (err) {
    log.error('blob.delete_failed', { storageKey, err });
  }
}
