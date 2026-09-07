"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { submitStepApprovalAction } from "@/app/(dashboard)/requests/[id]/approval-actions"

export interface ApprovalChainStep {
  stepId: string
  stepOrder: number
  name: string
  /** Human label for who approves: "Any reviewer", a member name, etc. */
  approverLabel: string
  status: "APPROVED" | "REJECTED" | "PENDING" | "WAITING"
  /** Set once the step has a recorded decision. */
  approverName: string | null
  decidedAt: string | null
  rationale: string | null
  /** Whether the viewer may decide this step (only ever true for PENDING). */
  canAct: boolean
}

export interface ApprovalChainProps {
  requestId: string
  workflowName: string
  steps: ApprovalChainStep[]
}

const STATUS_BADGE: Record<
  ApprovalChainStep["status"],
  { label: string; variant: "default" | "destructive" | "outline" | "secondary" }
> = {
  APPROVED: { label: "Approved", variant: "default" },
  REJECTED: { label: "Rejected", variant: "destructive" },
  PENDING: { label: "Awaiting approval", variant: "secondary" },
  WAITING: { label: "Not started", variant: "outline" },
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

export function ApprovalChain({ requestId, workflowName, steps }: ApprovalChainProps) {
  const router = useRouter()
  const [rationale, setRationale] = useState("")
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const actionableStep = steps.find((s) => s.status === "PENDING" && s.canAct)

  async function submit(decision: "APPROVED" | "REJECTED") {
    if (isPending) return
    setIsPending(true)
    setError(null)
    try {
      const result = await submitStepApprovalAction(requestId, decision, rationale)
      if (!result.success) {
        setError(result.error ?? "Failed to record approval.")
        return
      }
      setRationale("")
      router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Approval Chain</CardTitle>
        <CardDescription>{workflowName}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-3">
          {steps.map((step) => (
            <li key={step.stepId} className="flex gap-3 rounded-md border p-3">
              <span className="text-muted-foreground w-6 text-sm font-medium">
                {step.stepOrder}.
              </span>
              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{step.name}</span>
                  <Badge variant={STATUS_BADGE[step.status].variant}>
                    {STATUS_BADGE[step.status].label}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs">
                  Approver: {step.approverLabel}
                  {step.approverName && ` · decided by ${step.approverName}`}
                  {step.decidedAt && ` · ${formatDate(step.decidedAt)}`}
                </p>
                {step.rationale && (
                  <p className="text-muted-foreground text-sm">{step.rationale}</p>
                )}
              </div>
            </li>
          ))}
        </ol>

        {actionableStep && (
          <div className="space-y-3 rounded-md border p-4">
            <p className="text-sm font-medium">
              Your decision on step {actionableStep.stepOrder}: {actionableStep.name}
            </p>
            <Textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Rationale (optional)..."
              disabled={isPending}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => submit("APPROVED")} disabled={isPending}>
                {isPending ? "Submitting..." : "Approve Step"}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => submit("REJECTED")}
                disabled={isPending}
              >
                Reject Request
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Rejecting at any step rejects the whole request.
            </p>
          </div>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}
      </CardContent>
    </Card>
  )
}
