"use client"

import { Star } from "lucide-react"

interface VoteBadgeProps {
  averageScore: number
  voteCount: number
}

export function VoteBadge({ averageScore, voteCount }: VoteBadgeProps) {
  if (voteCount === 0) {
    return <span className="text-muted-foreground">--</span>
  }

  return (
    <div className="flex items-center gap-1">
      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
      <span className="text-sm">{averageScore.toFixed(1)}</span>
      <span className="text-muted-foreground text-xs">({voteCount})</span>
    </div>
  )
}
