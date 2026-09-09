"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { addComment } from "@/app/(dashboard)/requests/[id]/collaboration-actions"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { MentionableMember } from '@/lib/db/queries/collaboration'

interface CommentInputProps {
  requestId: string
  parentId?: string
  onCommentAdded?: () => void
  placeholder?: string
  compact?: boolean
  members?: MentionableMember[]
}

export function CommentInput({
  requestId,
  parentId,
  onCommentAdded,
  placeholder,
  compact,
  members = [],
}: CommentInputProps) {
  const router = useRouter()
  const [content, setContent] = useState("")
  const [isPending, setIsPending] = useState(false)
  const [selectedMemberId, setSelectedMemberId] = useState("")
  const [mentions, setMentions] = useState<MentionableMember[]>([])
  const [error, setError] = useState("")

  function addMention() {
    const member = members.find(candidate => candidate.id === selectedMemberId)
    if (!member || mentions.some(mention => mention.id === member.id)) return
    setMentions(current => [...current, member])
    setContent(current => `${current}${current && !current.endsWith(" ") ? " " : ""}@${member.name} `)
    setSelectedMemberId("")
  }

  function removeMention(member: MentionableMember) {
    setMentions(current => current.filter(candidate => candidate.id !== member.id))
    const token = `@${member.name}`
    setContent(current => {
      const start = current.indexOf(token)
      if (start < 0) return current
      const next = `${current.slice(0, start)}${current.slice(start + token.length)}`
      return next.replace(/ {2,}/g, ' ').trimStart()
    })
  }

  async function handleSubmit() {
    if (!content.trim() || isPending) return

    setIsPending(true)
    setError("")
    try {
      const readableContent = mentions.reduce(
        (value, mention) => value.includes(`@${mention.name}`) ? value : `${value} @${mention.name}`,
        content.trim(),
      )
      await addComment(requestId, readableContent, parentId, mentions.map(mention => mention.id))
      setContent("")
      setMentions([])
      router.refresh()
      onCommentAdded?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to post this comment.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="space-y-2">
      <Textarea
        aria-label={parentId ? "Reply text" : "Comment text"}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder ?? "Write a comment..."}
        className={compact ? "min-h-10" : undefined}
      />
      {members.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1 space-y-1">
            <label htmlFor={`mention-${requestId}-${parentId ?? 'root'}`} className="text-xs font-medium">
              Mention teammate
            </label>
            <select
              id={`mention-${requestId}-${parentId ?? 'root'}`}
              value={selectedMemberId}
              onChange={event => setSelectedMemberId(event.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Choose a teammate</option>
              {members.filter(member => !mentions.some(mention => mention.id === member.id)).map(member => (
                <option key={member.id} value={member.id}>{member.name} ({member.email})</option>
              ))}
            </select>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={!selectedMemberId} onClick={addMention}>
            Add mention
          </Button>
        </div>
      )}
      {mentions.length > 0 && (
        <ul aria-label="Selected mentions" className="flex flex-wrap gap-2 text-xs">
          {mentions.map(mention => (
            <li key={mention.id} className="rounded-full border px-2 py-1">
              @{mention.name}{' '}
              <button
                type="button"
                aria-label={`Remove ${mention.name} mention`}
                onClick={() => removeMention(mention)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
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
