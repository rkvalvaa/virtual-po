/**
 * Pure validation for attachment uploads. Runs on the client for fast
 * feedback and again in the server action before any blob call — the client
 * copy is a convenience, the server copy is the trust boundary.
 */

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

/** Allowlist, not a blocklist: anything unlisted is rejected. */
export const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** MIME types rendered inline as thumbnails in the attachments list. */
export const IMAGE_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
];

const MAX_FILENAME_LENGTH = 120;

export function isAllowedMimeType(mimeType: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

/** Drop C0 control characters and DEL. */
function stripControlChars(value: string): string {
  return Array.from(value)
    .filter((char) => {
      const code = char.codePointAt(0)!;
      return code > 31 && code !== 127;
    })
    .join('');
}

/**
 * Make a browser-supplied filename safe to use as a blob pathname segment:
 * drop directory traversal, path separators and control characters, then cap
 * the length while keeping the extension so downloads still open correctly.
 */
export function sanitizeFilename(filename: string): string {
  const base = stripControlChars(filename)
    // Both separators — a Windows client can send either.
    .split(/[/\\]/)
    .pop()!
    .replace(/^\.+/, '')
    .trim();

  if (base === '') return 'file';
  if (base.length <= MAX_FILENAME_LENGTH) return base;

  const dot = base.lastIndexOf('.');
  // Treat a very long trailing segment as "no extension" rather than letting
  // it eat the whole budget.
  const ext = dot > 0 && base.length - dot <= 16 ? base.slice(dot) : '';
  return base.slice(0, MAX_FILENAME_LENGTH - ext.length) + ext;
}

export type AttachmentValidation =
  | { ok: true; filename: string }
  | { ok: false; error: string };

export function validateAttachment(file: {
  name: string;
  type: string;
  size: number;
}): AttachmentValidation {
  if (!isAllowedMimeType(file.type)) {
    return {
      ok: false,
      error: `${file.name || 'File'}: file type ${file.type || 'unknown'} is not allowed`,
    };
  }
  if (file.size <= 0) {
    return { ok: false, error: `${file.name || 'File'}: file is empty` };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      error: `${file.name || 'File'}: exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB limit`,
    };
  }
  return { ok: true, filename: sanitizeFilename(file.name) };
}

/** Human-readable byte size for the attachment list. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
