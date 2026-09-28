"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { sendMessageToClient } from "@/app/(dashboard)/requests/[id]/client-message-actions"
import type { ClientMessage } from "@/lib/db/queries/client-messages"

/**
 * The thread the client sees, kept apart from internal comments. Everything
 * written here is visible to the client, and the composer says so.
 */
export function ClientMessagesCard({ requestId, messages, audience, canSend }: {
  requestId: string
  messages: ClientMessage[]
  audience: string
  canSend: boolean
}) {
  const router = useRouter()
  const [body, setBody] = useState("")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function send() {
    setError("")
    startTransition(async () => {
      const result = await sendMessageToClient(requestId, body)
      if (!result.success) { setError(result.error ?? "Unable to send the message."); return }
      setBody("")
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Client messages</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!messages.length && <p className="text-muted-foreground">No messages with the client yet. Internal comments are never shown to the client.</p>}
        {messages.map(message => (
          <div key={message.id} className="space-y-1 border-l-2 pl-3">
            <p className="text-xs text-muted-foreground">
              {message.authorName ?? (message.direction === "TO_CLIENT" ? "Team" : "Client")} → {message.direction === "TO_CLIENT" ? "client" : "team"} · {new Date(message.createdAt).toLocaleString()}
            </p>
            <p className="whitespace-pre-line break-words">{message.body}</p>
          </div>
        ))}
        {canSend && (
          <div className="space-y-2 border-t pt-3">
            <label htmlFor={`client-message-${requestId}`} className="text-sm font-medium">Message to the client</label>
            <Textarea id={`client-message-${requestId}`} value={body} maxLength={5000} onChange={e => setBody(e.target.value)} disabled={pending} />
            <p className="text-xs text-muted-foreground">Visible to {audience}</p>
            {error && <p role="alert" className="text-destructive">{error}</p>}
            <Button type="button" size="sm" disabled={pending || !body.trim()} onClick={send}>Send to client</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
