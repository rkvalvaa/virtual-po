"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { CommentInput } from "@/components/review/CommentInput"

export interface CommentNode {
  id: string
  content: string
  authorName: string
  parentId: string | null
  createdAt: string
}

interface CommentThreadProps {
  comments: CommentNode[]
  requestId: string
}

// Cap visual indentation at this depth — deeper replies still thread under
// their parent, they just stop indenting further so the layout doesn't run
// off-screen on long chains.
const MAX_INDENT_DEPTH = 3

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

function countDescendants(
  commentId: string,
  childrenByParent: Map<string, CommentNode[]>,
): number {
  const direct = childrenByParent.get(commentId) ?? []
  let total = direct.length
  for (const child of direct) {
    total += countDescendants(child.id, childrenByParent)
  }
  return total
}

function CommentItem({
  comment,
  depth,
  childrenByParent,
  requestId,
}: {
  comment: CommentNode
  depth: number
  childrenByParent: Map<string, CommentNode[]>
  requestId: string
}) {
  const [showReply, setShowReply] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const replies = childrenByParent.get(comment.id) ?? []
  const totalDescendants = countDescendants(comment.id, childrenByParent)
  const hasReplies = replies.length > 0
  const showIndent = depth < MAX_INDENT_DEPTH

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {hasReplies && (
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="text-muted-foreground hover:text-foreground mt-0.5 size-4 shrink-0"
            aria-label={collapsed ? "Expand thread" : "Collapse thread"}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </button>
        )}
        {!hasReplies && <div className="size-4 shrink-0" aria-hidden="true" />}

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold">{comment.authorName}</span>
            <span className="text-muted-foreground text-xs">
              {formatRelativeTime(comment.createdAt)}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm">{comment.content}</p>
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => setShowReply((v) => !v)}
              className="text-muted-foreground hover:text-foreground"
            >
              {showReply ? "Cancel" : "Reply"}
            </button>
            {hasReplies && collapsed && (
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                Show {totalDescendants}{" "}
                {totalDescendants === 1 ? "reply" : "replies"}
              </button>
            )}
          </div>
        </div>
      </div>

      {showReply && (
        <div className={showIndent ? "ml-6" : "ml-0"}>
          <CommentInput
            requestId={requestId}
            parentId={comment.id}
            onCommentAdded={() => setShowReply(false)}
            placeholder="Write a reply..."
            compact
          />
        </div>
      )}

      {hasReplies && !collapsed && (
        <div
          className={
            showIndent
              ? "border-muted ml-4 space-y-4 border-l-2 pl-4"
              : "space-y-4 pl-4"
          }
        >
          {replies.map((child) => (
            <CommentItem
              key={child.id}
              comment={child}
              depth={depth + 1}
              childrenByParent={childrenByParent}
              requestId={requestId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function CommentThread({ comments, requestId }: CommentThreadProps) {
  const topLevel = comments.filter((c) => c.parentId === null)
  const childrenByParent = new Map<string, CommentNode[]>()

  for (const comment of comments) {
    if (comment.parentId) {
      const existing = childrenByParent.get(comment.parentId) ?? []
      existing.push(comment)
      childrenByParent.set(comment.parentId, existing)
    }
  }

  return (
    <div className="space-y-6">
      <h3 className="font-semibold">Comments</h3>

      {topLevel.length > 0 ? (
        <div className="space-y-6">
          {topLevel.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              depth={0}
              childrenByParent={childrenByParent}
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
