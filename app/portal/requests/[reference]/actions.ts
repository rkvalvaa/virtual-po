"use server"

import { revalidatePath } from "next/cache"
import { requirePortalContact } from "@/lib/auth/session"
import { replyToMyRequest } from "@/lib/db/queries/portal"

export type ReplyState = { status: "sent" } | { status: "error"; message: string } | null

export async function replyToRequest(reference: string, _previous: ReplyState, formData: FormData): Promise<ReplyState> {
  const contact = await requirePortalContact()
  try {
    await replyToMyRequest(contact, reference, String(formData.get("body") ?? ""))
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (message === "Request not found." || message.startsWith("Write a message")) return { status: "error", message }
    throw error
  }
  revalidatePath(`/portal/requests/${reference}`)
  return { status: "sent" }
}
