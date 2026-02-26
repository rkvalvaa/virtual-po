"use client"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { ShieldAlert, ShieldCheck } from "lucide-react"

interface SecurityBadgeProps {
  severity: string | null
  requiresReview: boolean
  className?: string
}

function getSeverityStyle(severity: string): string {
  switch (severity) {
    case "critical":
      return "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300"
    case "high":
      return "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/60 dark:text-orange-300"
    case "medium":
      return "border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-300"
    case "low":
      return "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
    default:
      return "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/60 dark:text-green-300"
  }
}

export function SecurityBadge({ severity, requiresReview, className }: SecurityBadgeProps) {
  if (!requiresReview && (!severity || severity === "none")) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-1 border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/60 dark:text-green-300",
          className
        )}
      >
        <ShieldCheck className="size-3" />
        No security concerns
      </Badge>
    )
  }

  const label = severity
    ? `${severity.charAt(0).toUpperCase()}${severity.slice(1)} Security`
    : "Security Review"

  return (
    <Badge
      variant="outline"
      className={cn("gap-1", getSeverityStyle(severity ?? "medium"), className)}
    >
      <ShieldAlert className="size-3" />
      {label}
    </Badge>
  )
}
