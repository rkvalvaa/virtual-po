import { z } from 'zod';
import { getFeatureRequestById } from '@/lib/db/queries/feature-requests';
import { ALLOWED_MIME_TYPES, MAX_ATTACHMENT_BYTES, sanitizeFilename } from './validate';

/** Every attachment of a request lives under this blob prefix. */
export function attachmentPrefix(orgId: string, requestId: string): string {
  return `orgs/${orgId}/requests/${requestId}/`;
}

const payloadSchema = z.object({ requestId: z.uuid() });

/**
 * Decide whether the browser may upload `pathname` straight to the private
 * Blob store, and with which limits. This runs before any token is issued, so
 * it is the trust boundary for direct uploads: the request must be in the
 * caller's workspace and the path must be exactly <prefix>/<sanitized name>.
 */
export async function authorizeAttachmentUpload(
  actor: { id: string; orgId: string | null },
  pathname: string,
  clientPayload: string | null,
) {
  if (!actor.orgId) throw new Error('Sign in to a workspace to upload files.');
  let requestId: string;
  try {
    requestId = payloadSchema.parse(JSON.parse(clientPayload ?? '')).requestId;
  } catch {
    throw new Error('Invalid upload request');
  }

  const request = await getFeatureRequestById(requestId);
  if (!request || request.organizationId !== actor.orgId) throw new Error('Feature request not found');

  const prefix = attachmentPrefix(actor.orgId, requestId);
  const name = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
  if (!name || name !== sanitizeFilename(name)) throw new Error('Invalid upload path');

  return {
    allowedContentTypes: [...ALLOWED_MIME_TYPES],
    maximumSizeInBytes: MAX_ATTACHMENT_BYTES,
    // Two uploads of "screenshot.png" must not collide or overwrite.
    addRandomSuffix: true,
    tokenPayload: JSON.stringify({ requestId, userId: actor.id }),
  };
}
