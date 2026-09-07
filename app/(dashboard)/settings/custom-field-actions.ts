"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireAuth } from "@/lib/auth/session"
import {
  listCustomFieldDefinitions,
  createCustomFieldDefinition,
  updateCustomFieldDefinition,
  deleteCustomFieldDefinition,
} from "@/lib/db/queries/custom-fields"
import { slugifyFieldKey } from "@/lib/utils/custom-fields"
import { CUSTOM_FIELD_TYPES } from "@/lib/types/database"
import "@/lib/auth/types"

const definitionInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(80, "Name must be 80 characters or fewer")
    .refine((n) => slugifyFieldKey(n).length > 0, {
      message: "Name must contain at least one letter or number",
    }),
  type: z.enum(CUSTOM_FIELD_TYPES),
  options: z.array(z.string().trim().min(1)).max(50).default([]),
  required: z.boolean().default(false),
})

/** ADMIN-only, org-scoped session for every mutation below. */
async function requireAdminOrg(): Promise<string> {
  const session = await requireAuth()
  const orgId = session.user.orgId
  if (!orgId) throw new Error("No organization")
  if (session.user.role !== "ADMIN") throw new Error("Admin access required")
  return orgId
}

export async function addCustomField(input: unknown) {
  const orgId = await requireAdminOrg()
  const params = definitionInput.parse(input)

  if (params.type === "SELECT" && params.options.length === 0) {
    throw new Error("Dropdown fields need at least one option")
  }

  await createCustomFieldDefinition({
    organizationId: orgId,
    name: params.name,
    type: params.type,
    options: params.options,
    required: params.required,
  })

  revalidatePath("/settings")
}

export async function editCustomField(
  id: string,
  input: { name?: string; options?: string[]; required?: boolean }
) {
  const orgId = await requireAdminOrg()
  const params = definitionInput
    .pick({ name: true, options: true, required: true })
    .partial()
    .parse(input)

  const updated = await updateCustomFieldDefinition(id, orgId, params)
  if (!updated) throw new Error("Custom field not found")

  revalidatePath("/settings")
}

export async function removeCustomField(id: string) {
  const orgId = await requireAdminOrg()
  const deleted = await deleteCustomFieldDefinition(id, orgId)
  if (!deleted) throw new Error("Custom field not found")

  revalidatePath("/settings")
}

/**
 * Move a definition one position up or down by swapping sort_order with its
 * neighbour in the current display order.
 */
export async function moveCustomField(id: string, direction: "up" | "down") {
  const orgId = await requireAdminOrg()

  const definitions = await listCustomFieldDefinitions(orgId)
  const index = definitions.findIndex((d) => d.id === id)
  if (index === -1) throw new Error("Custom field not found")

  const neighbourIndex = direction === "up" ? index - 1 : index + 1
  if (neighbourIndex < 0 || neighbourIndex >= definitions.length) return

  const current = definitions[index]
  const neighbour = definitions[neighbourIndex]

  await updateCustomFieldDefinition(current.id, orgId, {
    sortOrder: neighbour.sortOrder,
  })
  await updateCustomFieldDefinition(neighbour.id, orgId, {
    sortOrder: current.sortOrder,
  })

  revalidatePath("/settings")
}
