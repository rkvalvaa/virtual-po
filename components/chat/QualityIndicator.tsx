"use client"

import { cn } from "@/lib/utils"

interface QualityIndicatorProps {
  score: number
}

export function QualityIndicator({ score }: QualityIndicatorProps) {
  const clampedScore = Math.max(0, Math.min(100, score))

  const colorClass =
    clampedScore >= 70
      ? "bg-green-500"
      : clampedScore >= 30
        ? "bg-yellow-500"
        : "bg-red-500"

  const label =
    clampedScore >= 70
      ? "Good"
      : clampedScore >= 30
        ? "Needs more detail"
        : "Incomplete"

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Intake Quality</span>
        <span className="text-muted-foreground">{clampedScore}%</span>
      </div>
      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full transition-all duration-500", colorClass)}
          style={{ width: `${clampedScore}%` }}
        />
      </div>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  )
}
