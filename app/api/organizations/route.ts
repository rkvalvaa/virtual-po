import { NextResponse } from "next/server"
import { auth } from "@/auth"
import {
  getUserOrganizations,
  createOrganization,
  addUserToOrganization,
  getOrganizationBySlug,
} from "@/lib/db/queries/organizations"
import "@/lib/auth/types"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const organizations = await getUserOrganizations(session.user.id)
  return NextResponse.json(organizations)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("name" in body) ||
    !("slug" in body)
  ) {
    return NextResponse.json(
      { error: "name and slug are required" },
      { status: 400 }
    )
  }

  const { name, slug } = body as { name: unknown; slug: unknown }

  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "name must be a non-empty string" },
      { status: 400 }
    )
  }

  if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    return NextResponse.json(
      { error: "slug must be lowercase alphanumeric with hyphens, at least 2 characters" },
      { status: 400 }
    )
  }

  // Check for slug uniqueness
  const existing = await getOrganizationBySlug(slug)
  if (existing) {
    return NextResponse.json(
      { error: "An organization with this slug already exists" },
      { status: 409 }
    )
  }

  const org = await createOrganization(name.trim(), slug)
  await addUserToOrganization(org.id, session.user.id, "ADMIN")

  return NextResponse.json(org, { status: 201 })
}
