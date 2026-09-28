import { NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { auth } from "@/auth"
import { isBlobConfigured } from "@/lib/storage/blob"
import { authorizeAttachmentUpload } from "@/lib/storage/upload-authorization"
import "@/lib/auth/types"

/**
 * Issues short-lived tokens for direct browser-to-Blob uploads. Files never
 * pass through this function, so the 1 MB Server Action and 4.5 MB Vercel
 * request limits do not apply. The attachment row is written afterwards by
 * `recordUploadedAttachment`, from what the store reports.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isBlobConfigured()) return NextResponse.json({ error: "File storage is not configured" }, { status: 503 })
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = (await request.json()) as HandleUploadBody
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: (pathname, clientPayload) =>
        authorizeAttachmentUpload({ id: session.user.id, orgId: session.user.orgId }, pathname, clientPayload),
    })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload refused" }, { status: 400 })
  }
}
