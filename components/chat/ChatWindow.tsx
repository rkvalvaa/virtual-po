"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { useEffect, useRef, useState, useMemo } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { MessageBubble } from "@/components/chat/MessageBubble"
import { TypingIndicator } from "@/components/chat/TypingIndicator"
import { Send } from "lucide-react"

interface ChatWindowProps {
  requestId: string
}

export function ChatWindow({ requestId }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState("")

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agents/intake",
        body: { requestId },
      }),
    [requestId]
  )

  const { messages, sendMessage, status, error } = useChat({ transport })

  const isStreaming = status === "streaming" || status === "submitted"

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || isStreaming) return
    setInput("")
    sendMessage({ text })
  }

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Describe your feature request and the intake agent will help
              gather all the necessary details.
            </p>
          )}
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isStreaming && <TypingIndicator />}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
              Something went wrong. Please try again.
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your feature request..."
            className="min-h-10 flex-1 resize-none"
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
            disabled={isStreaming || !input.trim()}
          >
            <Send />
          </Button>
        </form>
      </div>
    </div>
  )
}
