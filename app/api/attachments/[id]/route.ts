import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getAttachmentById } from "@/lib/db/queries/attachments"
import { attachmentDownload, readAttachment } from "@/lib/storage/blob"
import "@/lib/auth/types"

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

  return attachmentDownload(blob, attachment.filename)
}
