"use client"

import { useEffect, useState } from "react"
import { ChatWindow } from "@/components/chat/ChatWindow"
import { QualityIndicator } from "@/components/chat/QualityIndicator"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createNewRequest } from "./actions"

export function NewRequestContent() {
  const [requestId, setRequestId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [qualityScore] = useState(0)

  useEffect(() => {
    let cancelled = false

    createNewRequest()
      .then((result) => {
        if (!cancelled) {
          setRequestId(result.requestId)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to create request")
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

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
            <CardTitle className="text-sm">Tips</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-muted-foreground space-y-2 text-xs">
              <li>Describe the problem your feature solves</li>
              <li>Mention who will benefit from it</li>
              <li>Include any constraints or requirements</li>
              <li>Share examples or mockups if available</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
