"use server"

import { z } from "zod"
import { redirect } from "next/navigation"
import { requireAuth } from "@/lib/auth/session"
import { submitInternalRequest } from "@/lib/db/queries/internal-forms"

export type InternalSubmitState = { status: "invalid"; errors: Record<string, string> } | { status: "error"; message: string } | null

/** A workspace member files a change request; the form row decides organization, type and group. */
export async function submitInternalForm(formId: string, _previous: InternalSubmitState, formData: FormData): Promise<InternalSubmitState> {
  const session = await requireAuth()
  const key = z.uuid().safeParse(formData.get("__submissionKey"))
  if (!key.success) return { status: "error", message: "Reload the page and submit again." }
  // Only string answers; the definition decides which keys count. "__" names are form plumbing.
  const answers = Object.fromEntries([...formData.entries()].filter(([name, value]) => !name.startsWith("__") && typeof value === "string")) as Record<string, string>
  let result
  try {
    result = await submitInternalRequest({ orgId: session.user.orgId, userId: session.user.id, formId, submissionKey: key.data, answers })
  } catch (error) {
    if (error instanceof Error && error.message === "Form not found.") return { status: "error", message: "This form is not available." }
    throw error
  }
  if (result.status === "invalid") return result
  redirect(`/requests/${result.requestId}`)
}
