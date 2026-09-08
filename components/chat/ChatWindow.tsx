"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { useRouter } from "next/navigation"
import type { AgentStage } from "@/lib/agents/runs"
import { useEffect, useRef, useState, useMemo } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { MessageBubble } from "@/components/chat/MessageBubble"
import { TypingIndicator } from "@/components/chat/TypingIndicator"
import { Send } from "lucide-react"

interface ChatWindowProps {
  requestId: string
  stage?: AgentStage
  initialMessages?: UIMessage[]
  disabled?: boolean
  retryAvailable?: boolean
}

export function ChatWindow({ requestId, stage = "intake", initialMessages = [], disabled = false, retryAvailable = false }: ChatWindowProps) {
  const router = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState("")
  const draftKey = `vpo-message:${requestId}:${stage}`

  useEffect(() => {
    try {
      const draft = sessionStorage.getItem(draftKey) ?? sessionStorage.getItem(`${draftKey}:pending`)
      // Restore browser-only state after hydration.
      if (draft) queueMicrotask(() => setInput(draft))
    } catch { /* Storage is optional. */ }
  }, [draftKey])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: stage === "intake" ? "/api/agents/intake" : `/api/agents/${stage === "assessment" ? "assess" : stage === "output" ? "generate" : "security"}/${requestId}`,
        body: { requestId },
        prepareSendMessagesRequest: ({ messages }) => ({ body: { requestId, messages: messages.slice(-1) } }),
      }),
    [requestId, stage]
  )

  const { messages, sendMessage, regenerate, status, error } = useChat({
    id: `${requestId}:${stage}`, messages: initialMessages, transport,
    onFinish: ({ isError, isAbort }) => {
      if (!isError && !isAbort) {
        try { sessionStorage.removeItem(`${draftKey}:pending`) } catch { /* Storage is optional. */ }
      }
      router.refresh()
    },
  })

  const isStreaming = status === "streaming" || status === "submitted"

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || isStreaming || disabled) return
    setInput("")
    try {
      sessionStorage.setItem(`${draftKey}:pending`, text)
      sessionStorage.removeItem(draftKey)
    } catch { /* Storage is optional. */ }
    sendMessage({ text })
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <ScrollArea className="min-h-0 min-w-0 flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {stage === "intake" ? "Describe your feature request and the intake agent will help gather all the necessary details." : "Run this stage using the saved request details. Results are saved to the request."}
            </p>
          )}
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isStreaming && <TypingIndicator />}
          {(error || retryAvailable) && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
              Something went wrong. Please try again.
              {error && <p className="mt-1">{readableError(error)}</p>}
              <Button variant="outline" className="ml-2" disabled={isStreaming || disabled} onClick={() => regenerate()}>Retry last message</Button>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="border-t p-4">
        {stage !== "intake" && <Button className="mb-3" disabled={isStreaming || disabled} onClick={() => sendMessage({ text: `Complete the ${stage} stage using the saved request context and save the results. If a previous attempt partially saved results, reuse those artifacts and complete the missing work.` })}>
          {isStreaming ? "Running…" : stage === "assessment" ? "Run assessment" : stage === "security" ? "Run security review" : "Generate epic and stories"}
        </Button>}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            value={input}
            aria-label="Message to agent"
            disabled={disabled}
            onChange={(e) => {
              setInput(e.target.value)
              try { sessionStorage.setItem(draftKey, e.target.value) } catch { /* Storage is optional. */ }
            }}
            placeholder="Describe your feature request..."
            className="min-h-10 min-w-0 flex-1 resize-none"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send"
            disabled={disabled || isStreaming || !input.trim()}
          >
            <Send />
          </Button>
        </form>
      </div>
    </div>
  )
}

function readableError(error: Error): string {
  try {
    const payload = JSON.parse(error.message)
    if (typeof payload.error === "string") return payload.error
  } catch { /* Network and streaming errors can be plain text. */ }
  return error.message.slice(0, 400)
}
