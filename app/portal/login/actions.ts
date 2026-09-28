"use server"

import { z } from "zod"
import { redirect } from "next/navigation"
import { AuthError } from "next-auth"
import { signIn } from "@/auth"

export async function requestPortalLink(formData: FormData): Promise<void> {
  const email = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase())
  if (!email.success) redirect("/portal/login?error=email")
  let next: string
  try {
    // Auth.js answers with its verify-request URL both after sending a link
    // and for unknown or throttled addresses (auth.ts sends nothing then), so
    // the page below never reveals who has access. A failed send comes back
    // as an error-page URL instead.
    next = await signIn("resend", { email: email.data, redirectTo: "/portal", redirect: false })
  } catch (error) {
    if (error instanceof AuthError) redirect("/portal/login?error=unavailable")
    throw error
  }
  const sent = new URL(next, "http://localhost").pathname.endsWith("/verify-request")
  redirect(sent ? "/portal/check-email" : "/portal/login?error=unavailable")
}
