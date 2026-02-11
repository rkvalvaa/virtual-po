"use client"

import { Badge } from "@/components/ui/badge"
import { formatStatus } from "@/lib/utils/workflow"

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "outline",
  INTAKE_IN_PROGRESS: "secondary",
  PENDING_ASSESSMENT: "secondary",
  UNDER_REVIEW: "default",
  NEEDS_INFO: "outline",
  APPROVED: "default",
  REJECTED: "destructive",
  DEFERRED: "outline",
  IN_BACKLOG: "secondary",
  IN_PROGRESS: "default",
  COMPLETED: "default",
}

interface StatusBadgeProps {
  status: string
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge variant={statusVariant[status] ?? "outline"}>
      {formatStatus(status)}
    </Badge>
  )
}
