"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { addComment } from "@/app/(dashboard)/requests/[id]/actions"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface CommentInputProps {
  requestId: string
  parentId?: string
  onCommentAdded?: () => void
  placeholder?: string
  compact?: boolean
}

export function CommentInput({
  requestId,
  parentId,
  onCommentAdded,
  placeholder,
  compact,
}: CommentInputProps) {
  const router = useRouter()
  const [content, setContent] = useState("")
  const [isPending, setIsPending] = useState(false)

  async function handleSubmit() {
    if (!content.trim() || isPending) return

    setIsPending(true)
    try {
      await addComment(requestId, content.trim(), parentId)
      setContent("")
      router.refresh()
      onCommentAdded?.()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder ?? "Write a comment..."}
        className={compact ? "min-h-10" : undefined}
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!content.trim() || isPending}
        >
          {isPending
            ? "Posting..."
            : parentId
              ? "Reply"
              : "Post Comment"}
        </Button>
      </div>
    </div>
  )
}
