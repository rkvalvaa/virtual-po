"use client"

import { useState, useTransition } from "react"
import { Star, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { submitVote, removeVote } from "@/app/(dashboard)/requests/[id]/vote-actions"

interface VoteWidgetProps {
  requestId: string
  currentVote: {
    voteValue: number
    rationale: string | null
  } | null
  votes: Array<{
    voteValue: number
    rationale: string | null
    userName: string | null
    createdAt: string
  }>
  summary: {
    voteCount: number
    averageScore: number
  }
}

function StarRating({
  value,
  onChange,
  readonly = false,
}: {
  value: number
  onChange?: (v: number) => void
  readonly?: boolean
}) {
  const [hovered, setHovered] = useState(0)
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          className={`${readonly ? "cursor-default" : "cursor-pointer"} transition-colors`}
          onMouseEnter={() => !readonly && setHovered(star)}
          onMouseLeave={() => !readonly && setHovered(0)}
          onClick={() => onChange?.(star)}
        >
          <Star
            className={`h-5 w-5 ${
              star <= (hovered || value)
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground/40"
            }`}
          />
        </button>
      ))}
    </div>
  )
}

export function VoteWidget({
  requestId,
  currentVote,
  votes,
  summary,
}: VoteWidgetProps) {
  const [selectedValue, setSelectedValue] = useState(currentVote?.voteValue ?? 0)
  const [rationale, setRationale] = useState(currentVote?.rationale ?? "")
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    if (selectedValue < 1) return
    startTransition(async () => {
      await submitVote(requestId, selectedValue, rationale || null)
    })
  }

  function handleRemove() {
    startTransition(async () => {
      await removeVote(requestId)
      setSelectedValue(0)
      setRationale("")
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Stakeholder Votes
            {summary.voteCount > 0 && (
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                {summary.averageScore.toFixed(1)} avg ({summary.voteCount} vote
                {summary.voteCount !== 1 ? "s" : ""})
              </span>
            )}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Vote form */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Your rating:</span>
            <StarRating value={selectedValue} onChange={setSelectedValue} />
            {selectedValue > 0 && (
              <span className="text-muted-foreground text-sm">{selectedValue}/5</span>
            )}
          </div>
          <Textarea
            placeholder="Why do you think this is important? (optional)"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={2}
            className="resize-none"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={selectedValue < 1 || isPending}
            >
              {currentVote ? "Update Vote" : "Submit Vote"}
            </Button>
            {currentVote && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRemove}
                disabled={isPending}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Remove
              </Button>
            )}
          </div>
        </div>

        {/* Other votes */}
        {votes.length > 0 && (
          <div className="border-t pt-4">
            <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
              All Votes
            </p>
            <div className="space-y-2">
              {votes.map((vote, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <StarRating value={vote.voteValue} readonly />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{vote.userName ?? "Unknown"}</span>
                    {vote.rationale && (
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {vote.rationale}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
