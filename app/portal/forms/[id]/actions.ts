"use server"

import { z } from "zod"
import { requirePortalContact } from "@/lib/auth/session"
import { submitPortalRequest, type SubmissionResult } from "@/lib/db/queries/portal"

export type SubmitState = SubmissionResult | { status: "error"; message: string } | null

/** The key the form sends with every submission, so a retry cannot file twice. */
const SUBMISSION_KEY = "__submissionKey"

export async function submitPortalForm(formId: string, _previous: SubmitState, formData: FormData): Promise<SubmitState> {
  const contact = await requirePortalContact()
  const key = z.uuid().safeParse(formData.get(SUBMISSION_KEY))
  if (!key.success) return { status: "error", message: "Reload the page and submit again." }
  // Only string answers; the definition decides which keys count.
  const answers = Object.fromEntries([...formData.entries()].filter(([name, value]) => name !== SUBMISSION_KEY && typeof value === "string")) as Record<string, string>
  try {
    return await submitPortalRequest({ formId, contact, submissionKey: key.data, answers })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (message === "Form not found.") return { status: "error", message: "This form is not available." }
    if (message.includes("Try again later")) return { status: "error", message }
    throw error
  }
}
