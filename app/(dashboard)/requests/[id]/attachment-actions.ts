"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/session";
import { canAccess } from "@/lib/auth/rbac";
import { getFeatureRequestById } from "@/lib/db/queries/feature-requests";
import {
  createAttachment,
  deleteAttachment as deleteAttachmentRow,
  getAttachmentById,
} from "@/lib/db/queries/attachments";
import { logActivity } from "@/lib/db/queries/activity-log";
import {
  deleteAttachment as deleteBlob,
  isBlobConfigured,
  uploadAttachment,
} from "@/lib/storage/blob";
import { validateAttachment } from "@/lib/storage/validate";
import type { UserRole } from "@/lib/types/database";
import "@/lib/auth/types";

export type AttachmentActionResult =
  | { success: true }
  | { success: false; errors: string[] };

/**
 * Upload every file in `formData` under the key "files". Each file is
 * validated before it reaches the blob store; a rejected file does not stop
 * the others, its reason comes back in `errors`.
 */
export async function uploadAttachments(
  requestId: string,
  formData: FormData
): Promise<AttachmentActionResult> {
  const session = await requireAuth();
  const orgId = session.user.orgId;
  if (!orgId) {
    throw new Error("No organization");
  }

  const request = await getFeatureRequestById(requestId);
  if (!request || request.organizationId !== orgId) {
    throw new Error("Feature request not found");
  }

  if (!isBlobConfigured()) {
    return {
      success: false,
      errors: ["File storage is not configured"],
    };
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return { success: false, errors: ["No files selected"] };
  }

  const errors: string[] = [];
  let uploaded = 0;

  for (const file of files) {
    const validation = validateAttachment({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (!validation.ok) {
      errors.push(validation.error);
      continue;
    }

    try {
      const stored = await uploadAttachment({ orgId, requestId, file });
      await createAttachment({
        requestId,
        filename: validation.filename,
        mimeType: stored.contentType,
        size: stored.size,
        url: stored.url,
        storageKey: stored.storageKey,
        uploadedBy: session.user.id,
      });
      uploaded += 1;

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
    } catch {
      errors.push(`${validation.filename}: upload failed`);
    }
  }

  if (uploaded > 0) {
    revalidatePath("/requests/" + requestId);
  }

  return errors.length > 0 ? { success: false, errors } : { success: true };
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
