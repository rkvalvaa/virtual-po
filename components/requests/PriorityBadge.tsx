"use client"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { defaultScoringConfig, getPriorityLabel, type ScoringConfig } from '@/config/scoring'

interface PriorityBadgeProps {
  score: number | null
  config?: ScoringConfig
}

export function PriorityBadge({ score, config = defaultScoringConfig }: PriorityBadgeProps) {
  if (score === null) return null

  const colorClass =
    score >= config.thresholds.highPriority
      ? "bg-green-500/15 text-green-600 border-transparent"
      : score >= config.thresholds.mediumPriority
        ? "bg-yellow-500/15 text-yellow-600 border-transparent"
        : "bg-red-500/15 text-red-600 border-transparent"

  const label = getPriorityLabel(score, config)

  return (
    <Badge variant="outline" className={cn(colorClass)}>
      {score} - {label}
    </Badge>
  )
}
