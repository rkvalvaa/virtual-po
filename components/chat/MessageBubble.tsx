"use client"

import type { UIMessage } from "ai"
import { cn } from "@/lib/utils"

interface MessageBubbleProps {
  message: UIMessage
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user"

  const textContent = message.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("")

  const hasToolInvocations = message.parts.some(
    (part) => part.type === "tool-invocation"
  )

  if (!textContent && !hasToolInvocations) return null

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {textContent && (
          <p className="whitespace-pre-wrap">{textContent}</p>
        )}
        {hasToolInvocations && !textContent && (
          <p className="text-muted-foreground text-xs italic">
            Processing...
          </p>
        )}
      </div>
    </div>
  )
}
