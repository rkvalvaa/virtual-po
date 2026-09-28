import { NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { auth } from "@/auth"
import { isBlobConfigured } from "@/lib/storage/blob"
import { authorizePortalUpload } from "@/lib/storage/portal-upload-authorization"
import "@/lib/auth/types"

/**
 * Upload tokens for files a client contact attaches to a portal form. Lives
 * under /portal because the proxy keeps client sessions there. The files are
 * staged per visit and only attached when the form is submitted.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isBlobConfigured()) return NextResponse.json({ error: "File storage is not configured" }, { status: 503 })
  const session = await auth()
  const clientAccountId = session?.user?.clientAccountId
  if (!clientAccountId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = (await request.json()) as HandleUploadBody
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: (pathname, clientPayload) => authorizePortalUpload({ clientAccountId }, pathname, clientPayload),
    })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload refused" }, { status: 400 })
  }
}
