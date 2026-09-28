import { z } from 'zod';
import { query } from '@/lib/db/pool';
import { ALLOWED_MIME_TYPES, MAX_ATTACHMENT_BYTES, sanitizeFilename } from './validate';

/**
 * Where a portal visitor's files wait until the form is submitted. One folder
 * per client, form and visit (the submission key), so a submission can only
 * claim files uploaded in the same visit.
 */
export function portalStagingPrefix(clientAccountId: string, formId: string, submissionKey: string): string {
  return `portal/${clientAccountId}/${formId}/${submissionKey}/`;
}

const payloadSchema = z.object({ formId: z.uuid(), submissionKey: z.uuid() });

/**
 * Decide whether a client contact may upload `pathname` straight to the
 * private Blob store: the form must be published to their client and accept
 * files, and the path must be exactly their staging folder plus a sanitized
 * name. The submission checks the files again before attaching them.
 */
export async function authorizePortalUpload(
  contact: { clientAccountId: string },
  pathname: string,
  clientPayload: string | null,
) {
  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(JSON.parse(clientPayload ?? ''));
  } catch {
    throw new Error('Invalid upload request');
  }

  const form = await query(`SELECT (published->>'maxAttachments')::int AS max_attachments FROM intake_forms
    WHERE id = $1 AND client_account_id = $2 AND status = 'PUBLISHED'`, [payload.formId, contact.clientAccountId]);
  if (!form.rowCount) throw new Error('This form is not available.');
  if (!form.rows[0].max_attachments) throw new Error('This form does not accept files.');

  const prefix = portalStagingPrefix(contact.clientAccountId, payload.formId, payload.submissionKey);
  const name = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
  if (!name || name !== sanitizeFilename(name)) throw new Error('Invalid upload path');

  return {
    allowedContentTypes: [...ALLOWED_MIME_TYPES],
    maximumSizeInBytes: MAX_ATTACHMENT_BYTES,
    addRandomSuffix: true,
    tokenPayload: JSON.stringify(payload),
  };
}
