import { requireAuth } from "@/lib/auth/session"
import { getActiveTemplates, seedDefaultTemplates } from "@/lib/db/queries/templates"
import Link from "next/link"
import { listInternalForms } from "@/lib/db/queries/internal-forms"
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

  const forms = orgId ? await listInternalForms(orgId) : []

  return (
    <>
      <NewRequestContent templates={templates} />
      {forms.length > 0 && (
        <section aria-label="Request forms" className="mx-auto mt-8 w-full max-w-4xl space-y-2">
          <h2 className="text-lg font-semibold">Or use a form</h2>
          <p className="text-sm text-muted-foreground">Change requests go straight to a service group, without the AI intake.</p>
          <ul className="space-y-1">
            {forms.map((form) => (
              <li key={form.id} className="text-sm">
                <Link href={`/requests/new/forms/${form.id}`} className="underline">{form.title}</Link>
                <span className="text-muted-foreground"> · {form.groupName}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
