"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { getAvailableActions, formatStatus } from "@/lib/utils/workflow"
import { submitDecision } from "@/app/(dashboard)/requests/[id]/actions"
import type { RequestStatus, UserRole, DecisionType } from "@/lib/types/database"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

interface DecisionPanelProps {
  requestId: string
  currentStatus: string
  userRole: string
  decisions: Array<{
    id: string
    decision: string
    rationale: string
    userId: string
    createdAt: string
  }>
}

const STATUS_TO_DECISION: Record<string, DecisionType> = {
  APPROVED: "APPROVE",
  REJECTED: "REJECT",
  DEFERRED: "DEFER",
  NEEDS_INFO: "REQUEST_INFO",
}

const DECISION_BADGE_VARIANT: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
  APPROVE: "default",
  REJECT: "destructive",
  DEFER: "outline",
  REQUEST_INFO: "secondary",
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function DecisionPanel({
  requestId,
  currentStatus,
  userRole,
  decisions,
}: DecisionPanelProps) {
  const router = useRouter()
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const [rationale, setRationale] = useState("")
  const [isPending, setIsPending] = useState(false)

  const actions = getAvailableActions(
    currentStatus as RequestStatus,
    userRole as UserRole
  )

  const reviewActions = actions.filter(
    (a) => STATUS_TO_DECISION[a.targetStatus]
  )
  const otherActions = actions.filter(
    (a) => !STATUS_TO_DECISION[a.targetStatus]
  )

  async function handleSubmit() {
    if (!activeAction || !rationale.trim() || isPending) return

    const decisionType = STATUS_TO_DECISION[activeAction]
    if (!decisionType) return

    setIsPending(true)
    try {
      await submitDecision(requestId, decisionType, rationale.trim())
      setActiveAction(null)
      setRationale("")
      router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  const hasActions = actions.length > 0
  const hasDecisions = decisions.length > 0

  if (!hasActions && !hasDecisions) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasActions && (
          <>
            <div className="text-muted-foreground text-sm">
              Current status: <span className="font-medium text-foreground">{formatStatus(currentStatus)}</span>
            </div>

            {reviewActions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {reviewActions.map((action) => (
                  <Button
                    key={action.targetStatus}
                    variant={action.variant}
                    size="sm"
                    onClick={() => {
                      setActiveAction(action.targetStatus)
                      setRationale("")
                    }}
                    disabled={isPending}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            )}

            {otherActions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {otherActions.map((action) => (
                  <Button
                    key={action.targetStatus}
                    variant={action.variant}
                    size="sm"
                    onClick={() => {
                      setActiveAction(action.targetStatus)
                      setRationale("")
                    }}
                    disabled={isPending}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            )}

            {activeAction && STATUS_TO_DECISION[activeAction] && (
              <div className="space-y-3 rounded-md border p-4">
                <p className="text-sm font-medium">
                  Provide rationale for: {formatStatus(activeAction)}
                </p>
                <Textarea
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  placeholder="Explain the reason for this decision..."
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={!rationale.trim() || isPending}
                  >
                    {isPending ? "Submitting..." : "Submit Decision"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setActiveAction(null)
                      setRationale("")
                    }}
                    disabled={isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {hasActions && hasDecisions && <Separator />}

        {hasDecisions && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Decision History</h4>
            {decisions.map((d) => (
              <div key={d.id} className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={DECISION_BADGE_VARIANT[d.decision] ?? "outline"}
                  >
                    {d.decision}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {formatDate(d.createdAt)}
                  </span>
                </div>
                <p className="text-muted-foreground text-sm">{d.rationale}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
