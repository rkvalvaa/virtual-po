"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { TemplatePicker } from "@/components/requests/TemplatePicker"
import { createNewRequest } from "./actions"

interface Template {
  id: string
  name: string
  description: string | null
  category: string
  icon: string | null
  defaultTitle: string | null
  promptHints: string[]
}

interface NewRequestContentProps {
  templates: Template[]
}

export function NewRequestContent({ templates }: NewRequestContentProps) {
  const router = useRouter()
  const [step, setStep] = useState<"pick" | "loading">(
    "pick"
  )
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  const lastAttempt = useRef<Parameters<typeof createNewRequest>[0] | null>(null)

  function startRequest(params?: {
    title?: string
    templateId?: string
    promptHints?: string[]
  }) {
    if (pending.current) return
    pending.current = true
    setError(null)
    setStep("loading")
    if (!lastAttempt.current) {
      let idempotencyKey: string = crypto.randomUUID()
      try {
        const stored = sessionStorage.getItem("vpo-pending-draft")
        if (stored) idempotencyKey = stored
        else sessionStorage.setItem("vpo-pending-draft", idempotencyKey)
      } catch { /* Storage can be disabled; the in-memory key still protects retries. */ }
      lastAttempt.current = { ...params, idempotencyKey }
    }
    createNewRequest(lastAttempt.current)
      .then((result) => {
        try { sessionStorage.removeItem("vpo-pending-draft") } catch { /* optional storage */ }
        router.replace(`/requests/${result.requestId}/workflow`)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to create request")
      })
      .finally(() => { pending.current = false })
  }

  if (step === "pick") {
    return (
      <TemplatePicker
        templates={templates}
        onSelect={(template, titleOverride) =>
          startRequest({
            title: titleOverride || template.defaultTitle || template.name,
            templateId: template.id,
            promptHints: template.promptHints,
          })
        }
        onSkip={(titleOverride) =>
          startRequest(titleOverride ? { title: titleOverride } : undefined)
        }
      />
    )
  }

  if (error) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <Card className="max-w-md">
          <CardContent>
            <p className="text-destructive text-sm">{error}</p>
            <Button className="mt-4" onClick={() => startRequest()}>Retry</Button>
            <Button asChild className="ml-2 mt-4" variant="outline"><Link href="/requests">View requests</Link></Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <p className="text-muted-foreground text-sm">Setting up your request...</p>
      </div>
  )
}
