import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getAttachmentById } from "@/lib/db/queries/attachments"
import { readAttachment } from "@/lib/storage/blob"
import "@/lib/auth/types"

/**
 * Content-Disposition filename. ASCII names go in the quoted form; anything
 * else also gets the RFC 5987 `filename*` form so non-ASCII survives.
 */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")
  const encoded = encodeURIComponent(filename)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const attachment = await getAttachmentById(id)

  // Cross-org reads are indistinguishable from a missing file on purpose:
  // a 403 would confirm the id exists.
  if (!attachment || attachment.organizationId !== session.user.orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (!attachment.storageKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const blob = await readAttachment(attachment.storageKey)
  if (!blob) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return new Response(blob.stream, {
    headers: {
      "Content-Type": blob.contentType,
      "Content-Length": String(blob.size),
      "Content-Disposition": contentDisposition(attachment.filename),
      // Private files must not land in a shared cache.
      "Cache-Control": "private, no-store",
    },
  })
}
