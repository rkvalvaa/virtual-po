"use server"

import { z } from "zod"
import { requirePortalContact } from "@/lib/auth/session"
import { submitPortalRequest, type SubmissionResult } from "@/lib/db/queries/portal"

export type SubmitState = SubmissionResult | { status: "error"; message: string } | null

/** The key the form sends with every submission, so a retry cannot file twice. */
const SUBMISSION_KEY = "__submissionKey"
const stagedFile = z.object({ pathname: z.string().max(500), name: z.string().max(300) })

export async function submitPortalForm(formId: string, _previous: SubmitState, formData: FormData): Promise<SubmitState> {
  const contact = await requirePortalContact()
  const key = z.uuid().safeParse(formData.get(SUBMISSION_KEY))
  if (!key.success) return { status: "error", message: "Reload the page and submit again." }
  // Only string answers; the definition decides which keys count. "__" names are form plumbing.
  const answers = Object.fromEntries([...formData.entries()].filter(([name, value]) => !name.startsWith("__") && typeof value === "string")) as Record<string, string>
  // Staged file paths; the query re-checks every one against this visit and the store.
  const attachments = formData.getAll("__attachment").flatMap(value => {
    const parsed = stagedFile.safeParse((() => { try { return JSON.parse(String(value)) } catch { return null } })())
    return parsed.success ? [parsed.data] : []
  })
  try {
    return await submitPortalRequest({ formId, contact, submissionKey: key.data, answers, attachments })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (message === "Form not found.") return { status: "error", message: "This form is not available." }
    if (message.includes("Try again later")) return { status: "error", message }
    throw error
  }
}
