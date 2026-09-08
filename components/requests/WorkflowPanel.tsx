"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import type { UIMessage } from "ai"
import type { AgentStage } from "@/lib/agents/runs"
import { ChatWindow } from "@/components/chat/ChatWindow"

export function WorkflowPanel({ requestId, stage, messages, running, retryAvailable }: {
  requestId: string; stage: AgentStage; messages: UIMessage[]; running: boolean; retryAvailable: boolean
}) {
  const router = useRouter()
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 3000)
    return () => clearInterval(timer)
  }, [router])
  return <div className="h-[min(65vh,42rem)] min-h-80">
    <ChatWindow key={stage} requestId={requestId} stage={stage} initialMessages={messages} disabled={running} retryAvailable={retryAvailable} />
  </div>
}
