import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getFeatureRequestById } from "@/lib/db/queries/feature-requests"
import { generateRequestPDF } from "@/lib/utils/pdf"
import "@/lib/auth/types"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return NextResponse.json({ error: "No organization found" }, { status: 400 })
  }

  const { id } = await params
  const request = await getFeatureRequestById(id)

  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (request.organizationId !== orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const pdfBytes = generateRequestPDF(request)

  // Slugify the title so the filename is shell-safe.
  const slug = request.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
  const date = new Date().toISOString().slice(0, 10)
  const filename = `${slug || "request"}-${date}.pdf`

  return new Response(pdfBytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
