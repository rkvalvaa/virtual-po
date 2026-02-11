"use client"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

interface PriorityBadgeProps {
  score: number | null
}

export function PriorityBadge({ score }: PriorityBadgeProps) {
  if (score === null) return null

  const colorClass =
    score >= 75
      ? "bg-green-500/15 text-green-600 border-transparent"
      : score >= 50
        ? "bg-yellow-500/15 text-yellow-600 border-transparent"
        : "bg-red-500/15 text-red-600 border-transparent"

  const label = score >= 75 ? "High" : score >= 50 ? "Medium" : "Low"

  return (
    <Badge variant="outline" className={cn(colorClass)}>
      {score} - {label}
    </Badge>
  )
}
