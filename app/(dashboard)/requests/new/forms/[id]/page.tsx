import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/auth/session"
import { getInternalForm } from "@/lib/db/queries/internal-forms"
import { InternalFormSubmission } from "@/components/requests/InternalFormSubmission"
import { Card, CardContent } from "@/components/ui/card"
import { submitInternalForm } from "./actions"

export const metadata: Metadata = { title: "Submit a change request" }

export default async function InternalFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireAuth()
  // Another workspace's, a client's, a paused form or an archived group's form is a 404.
  const form = /^[0-9a-f-]{36}$/i.test(id) ? await getInternalForm(session.user.orgId, id) : null
  if (!form) notFound()

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <Link href="/requests/new" className="text-sm underline">New request</Link>
      <p className="text-sm text-muted-foreground">Goes to {form.groupName} as a change request.</p>
      <Card>
        <CardContent className="pt-6">
          <InternalFormSubmission definition={form.definition} organizationName={form.organizationName} submit={submitInternalForm.bind(null, form.id)} />
        </CardContent>
      </Card>
    </div>
  )
}
