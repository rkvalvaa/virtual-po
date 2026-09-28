import { NextResponse } from "next/server"
import { requirePortalContact } from "@/lib/auth/session"
import { getMyAttachment } from "@/lib/db/queries/portal"
import { attachmentDownload, readAttachment } from "@/lib/storage/blob"

/** A client contact downloads one of their own uploads; anything else is a 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ reference: string; id: string }> }) {
  const { reference, id } = await params
  const contact = await requirePortalContact()
  const valid = /^[A-Z2-9]{10}$/.test(reference) && /^[0-9a-f-]{36}$/i.test(id)
  const file = valid ? await getMyAttachment(contact, reference, id) : null
  const blob = file ? await readAttachment(file.storageKey) : null
  if (!file || !blob) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return attachmentDownload(blob, file.filename)
}
