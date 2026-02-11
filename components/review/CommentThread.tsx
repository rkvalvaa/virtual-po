"use client"

import { useState } from "react"
import { CommentInput } from "@/components/review/CommentInput"

interface CommentThreadProps {
  comments: Array<{
    id: string
    content: string
    authorName: string
    parentId: string | null
    createdAt: string
  }>
  requestId: string
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diffMs = now - date
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) return "just now"
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 30) return `${diffDays}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function Comment({
  comment,
  replies,
  requestId,
}: {
  comment: CommentThreadProps["comments"][number]
  replies: CommentThreadProps["comments"]
  requestId: string
}) {
  const [showReply, setShowReply] = useState(false)

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold">{comment.authorName}</span>
          <span className="text-muted-foreground text-xs">
            {formatRelativeTime(comment.createdAt)}
          </span>
        </div>
        <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
        <button
          type="button"
          onClick={() => setShowReply(!showReply)}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          {showReply ? "Cancel" : "Reply"}
        </button>
      </div>

      {showReply && (
        <div className="ml-4">
          <CommentInput
            requestId={requestId}
            parentId={comment.id}
            onCommentAdded={() => setShowReply(false)}
            placeholder="Write a reply..."
            compact
          />
        </div>
      )}

      {replies.length > 0 && (
        <div className="border-muted ml-4 space-y-3 border-l-2 pl-4">
          {replies.map((reply) => (
            <div key={reply.id} className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold">{reply.authorName}</span>
                <span className="text-muted-foreground text-xs">
                  {formatRelativeTime(reply.createdAt)}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{reply.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function CommentThread({ comments, requestId }: CommentThreadProps) {
  const topLevel = comments.filter((c) => c.parentId === null)
  const repliesByParent = new Map<string, CommentThreadProps["comments"]>()

  for (const comment of comments) {
    if (comment.parentId) {
      const existing = repliesByParent.get(comment.parentId) ?? []
      existing.push(comment)
      repliesByParent.set(comment.parentId, existing)
    }
  }

  return (
    <div className="space-y-6">
      <h3 className="font-semibold">Comments</h3>

      {topLevel.length > 0 ? (
        <div className="space-y-6">
          {topLevel.map((comment) => (
            <Comment
              key={comment.id}
              comment={comment}
              replies={repliesByParent.get(comment.id) ?? []}
              requestId={requestId}
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">No comments yet.</p>
      )}

      <div className="pt-2">
        <CommentInput
          requestId={requestId}
          placeholder="Add a comment..."
        />
      </div>
    </div>
  )
}
