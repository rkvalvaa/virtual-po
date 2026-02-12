"use client"

import { useState } from "react"
import { ChatWindow } from "@/components/chat/ChatWindow"
import { QualityIndicator } from "@/components/chat/QualityIndicator"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  const [step, setStep] = useState<"pick" | "loading" | "chat">(
    templates.length > 0 ? "pick" : "loading"
  )
  const [requestId, setRequestId] = useState<string | null>(null)
  const [promptHints, setPromptHints] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [qualityScore] = useState(0)

  function startRequest(params?: {
    title?: string
    templateId?: string
    promptHints?: string[]
  }) {
    setStep("loading")
    createNewRequest(params)
      .then((result) => {
        setRequestId(result.requestId)
        setPromptHints(result.promptHints)
        setStep("chat")
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to create request")
      })
  }

  // Auto-start if no templates
  if (step === "loading" && !requestId && !error && templates.length === 0) {
    startRequest()
  }

  if (step === "pick") {
    return (
      <TemplatePicker
        templates={templates}
        onSelect={(template) =>
          startRequest({
            title: template.defaultTitle || template.name,
            templateId: template.id,
            promptHints: template.promptHints,
          })
        }
        onSkip={() => startRequest()}
      />
    )
  }

  if (error) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <Card className="max-w-md">
          <CardContent>
            <p className="text-destructive text-sm">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!requestId) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <p className="text-muted-foreground text-sm">Setting up your request...</p>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6">
      <Card className="flex flex-1 flex-col overflow-hidden py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>Intake Agent</CardTitle>
        </CardHeader>
        <div className="flex-1 overflow-hidden">
          <ChatWindow requestId={requestId} />
        </div>
      </Card>

      <div className="w-64 shrink-0 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <QualityIndicator score={qualityScore} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {promptHints.length > 0 ? "Guide" : "Tips"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-muted-foreground space-y-2 text-xs">
              {promptHints.length > 0
                ? promptHints.map((hint, i) => <li key={i}>{hint}</li>)
                : (
                    <>
                      <li>Describe the problem your feature solves</li>
                      <li>Mention who will benefit from it</li>
                      <li>Include any constraints or requirements</li>
                      <li>Share examples or mockups if available</li>
                    </>
                  )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
