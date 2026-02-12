import { requireAuth } from "@/lib/auth/session"
import { getActiveTemplates, seedDefaultTemplates } from "@/lib/db/queries/templates"
import { NewRequestContent } from "./NewRequestContent"
import "@/lib/auth/types"

export default async function NewRequestPage() {
  const session = await requireAuth()
  const orgId = session.user.orgId

  let templates: Array<{
    id: string
    name: string
    description: string | null
    category: string
    icon: string | null
    defaultTitle: string | null
    promptHints: string[]
  }> = []

  if (orgId) {
    await seedDefaultTemplates(orgId)
    const rows = await getActiveTemplates(orgId)
    templates = rows.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      icon: t.icon,
      defaultTitle: t.defaultTitle,
      promptHints: t.promptHints,
    }))
  }

  return <NewRequestContent templates={templates} />
}
