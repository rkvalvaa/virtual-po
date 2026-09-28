"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/session";
import { canAccess } from "@/lib/auth/rbac";
import { getFeatureRequestById } from "@/lib/db/queries/feature-requests";
import {
  createAttachment,
  deleteAttachment as deleteAttachmentRow,
  getAttachmentById,
  getAttachmentByStorageKey,
} from "@/lib/db/queries/attachments";
import { logActivity } from "@/lib/db/queries/activity-log";
import {
  deleteAttachment as deleteBlob,
  isBlobConfigured,
  statAttachment,
} from "@/lib/storage/blob";
import { sanitizeFilename, validateAttachment } from "@/lib/storage/validate";
import { attachmentPrefix } from "@/lib/storage/upload-authorization";
import type { UserRole } from "@/lib/types/database";
import "@/lib/auth/types";

export type AttachmentActionResult =
  | { success: true }
  | { success: false; errors: string[] };

/**
 * Record a file the browser has just uploaded straight to Blob storage (see
 * /api/attachments/upload). Size and type come from the store, not the
 * browser; a stored file that breaks the rules is deleted, not recorded.
 * Recording the same pathname twice is a no-op.
 */
export async function recordUploadedAttachment(
  requestId: string,
  pathname: string,
  originalName: string
): Promise<AttachmentActionResult> {
  const session = await requireAuth();
  const orgId = session.user.orgId;
  const filename = sanitizeFilename(originalName);
  const failed: AttachmentActionResult = { success: false, errors: [`${filename}: upload failed`] };

  const request = await getFeatureRequestById(requestId);
  if (!request || request.organizationId !== orgId) return failed;
  if (!pathname.startsWith(attachmentPrefix(orgId, requestId))) return failed;
  if (!isBlobConfigured()) return { success: false, errors: ["File storage is not configured"] };

  if (await getAttachmentByStorageKey(pathname)) return { success: true };
  const stored = await statAttachment(pathname);
  if (!stored) return failed;
  const validation = validateAttachment({ name: filename, type: stored.contentType, size: stored.size });
  if (!validation.ok) {
    await deleteBlob(pathname);
    return { success: false, errors: [validation.error] };
  }

  await createAttachment({
    requestId,
    filename: validation.filename,
    mimeType: stored.contentType,
    size: stored.size,
    url: stored.url,
    storageKey: pathname,
    uploadedBy: session.user.id,
  });
  try {
    await logActivity({
      organizationId: orgId,
      requestId,
      userId: session.user.id,
      action: "REQUEST_UPDATED",
      entityType: "REQUEST",
      entityId: requestId,
      metadata: { attachment: validation.filename },
    });
  } catch { /* activity logging is non-critical */ }
  revalidatePath("/requests/" + requestId);
  return { success: true };
}

/**
 * Remove an attachment. The uploader can remove their own; ADMINs can remove
 * any. The row goes first — an orphaned blob is cheaper than a dangling row.
 */
export async function removeAttachment(
  attachmentId: string
): Promise<AttachmentActionResult> {
  const session = await requireAuth();
  const orgId = session.user.orgId;
  if (!orgId) {
    throw new Error("No organization");
  }

  const attachment = await getAttachmentById(attachmentId);
  if (!attachment || attachment.organizationId !== orgId) {
    throw new Error("Attachment not found");
  }

  const isUploader = attachment.uploadedBy === session.user.id;
  if (!isUploader && !canAccess(session.user.role as UserRole, "ADMIN")) {
    throw new Error("Insufficient permissions: ADMIN role required");
  }

  const deleted = await deleteAttachmentRow(attachmentId, orgId, session.user.id);
  if (deleted && attachment.storageKey) {
    // Logged, never fatal: the row is already gone from the user's view.
    await deleteBlob(attachment.storageKey);
  }

  revalidatePath("/requests/" + attachment.requestId);

  return { success: true };
}
