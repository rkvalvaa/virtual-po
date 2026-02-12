"use server"

import { revalidatePath } from "next/cache"
import { requireAuth } from "@/lib/auth/session"
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "@/lib/db/queries/templates"
import type { TemplateCategory } from "@/lib/types/database"
import "@/lib/auth/types"

export async function addTemplate(params: {
  name: string
  description?: string
  category: TemplateCategory
  icon?: string
  defaultTitle?: string
  promptHints?: string[]
}) {
  const session = await requireAuth()
  const orgId = session.user.orgId
  if (!orgId) throw new Error("No organization")
  if (session.user.role !== "ADMIN") throw new Error("Admin access required")

  await createTemplate({
    organizationId: orgId,
    name: params.name,
    description: params.description,
    category: params.category,
    icon: params.icon,
    defaultTitle: params.defaultTitle,
    promptHints: params.promptHints,
  })

  revalidatePath("/settings")
  revalidatePath("/requests/new")
}

export async function editTemplate(
  id: string,
  params: {
    name?: string
    description?: string | null
    category?: TemplateCategory
    icon?: string | null
    defaultTitle?: string | null
    promptHints?: string[]
    isActive?: boolean
    sortOrder?: number
  }
) {
  const session = await requireAuth()
  if (session.user.role !== "ADMIN") throw new Error("Admin access required")

  await updateTemplate(id, params)

  revalidatePath("/settings")
  revalidatePath("/requests/new")
}

export async function removeTemplate(id: string) {
  const session = await requireAuth()
  if (session.user.role !== "ADMIN") throw new Error("Admin access required")

  await deleteTemplate(id)

  revalidatePath("/settings")
  revalidatePath("/requests/new")
}
