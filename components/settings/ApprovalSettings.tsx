"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  saveApprovalWorkflow,
  deleteApprovalWorkflow,
} from "@/app/(dashboard)/settings/approval-workflow-actions"

interface StepDraft {
  name: string
  /** "ROLE:REVIEWER" | "ROLE:ADMIN" | "USER:<uuid>" — one select, one value. */
  approver: string
}

export interface ApprovalSettingsProps {
  workflow: {
    id: string
    name: string
    isActive: boolean
    autoApproveMinPriority: number | null
    steps: Array<{
      name: string
      approverRole: string | null
      approverUserId: string | null
    }>
  } | null
  members: Array<{
    userId: string
    userName: string | null
    userEmail: string
    role: string
  }>
  userRole: string
}

function toApproverValue(step: {
  approverRole: string | null
  approverUserId: string | null
}): string {
  return step.approverUserId
    ? `USER:${step.approverUserId}`
    : `ROLE:${step.approverRole ?? "REVIEWER"}`
}

function fromApproverValue(value: string): {
  approverRole: "REVIEWER" | "ADMIN" | null
  approverUserId: string | null
} {
  if (value.startsWith("USER:")) {
    return { approverRole: null, approverUserId: value.slice(5) }
  }
  const role = value.slice(5)
  return {
    approverRole: role === "ADMIN" ? "ADMIN" : "REVIEWER",
    approverUserId: null,
  }
}

export function ApprovalSettings({
  workflow,
  members,
  userRole,
}: ApprovalSettingsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(workflow?.name ?? "Approval chain")
  const [isActive, setIsActive] = useState(workflow?.isActive ?? false)
  const [threshold, setThreshold] = useState(
    workflow?.autoApproveMinPriority !== null &&
      workflow?.autoApproveMinPriority !== undefined
      ? String(workflow.autoApproveMinPriority)
      : ""
  )
  const [steps, setSteps] = useState<StepDraft[]>(
    workflow?.steps.map((s) => ({ name: s.name, approver: toApproverValue(s) })) ?? []
  )

  const isAdmin = userRole === "ADMIN"

  function updateStep(index: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  function moveStep(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= steps.length) return
    setSteps((prev) => {
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
  }

  function handleSave() {
    setError(null)
    const parsedThreshold = threshold.trim() === "" ? null : Number(threshold)
    if (parsedThreshold !== null && !Number.isFinite(parsedThreshold)) {
      setError("Auto-approve threshold must be a number.")
      return
    }
    if (steps.some((s) => !s.name.trim())) {
      setError("Every step needs a name.")
      return
    }

    startTransition(async () => {
      const result = await saveApprovalWorkflow({
        workflowId: workflow?.id ?? null,
        name: name.trim(),
        isActive,
        autoApproveMinPriority: parsedThreshold,
        steps: steps.map((s) => ({
          name: s.name.trim(),
          ...fromApproverValue(s.approver),
        })),
      })
      if (!result.success) {
        setError(result.error ?? "Failed to save.")
        return
      }
      router.refresh()
    })
  }

  function handleDelete() {
    if (!workflow) return
    setError(null)
    startTransition(async () => {
      const result = await deleteApprovalWorkflow(workflow.id)
      if (!result.success) {
        setError(result.error ?? "Failed to delete.")
        return
      }
      setSteps([])
      setIsActive(false)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Approval Workflow</CardTitle>
            <CardDescription>
              Requests under review must clear each step in order before they are
              approved. Any step rejecting rejects the request.
            </CardDescription>
          </div>
          {workflow?.isActive && <Badge>Active</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!isAdmin && (
          <p className="text-muted-foreground text-sm">
            Only admins can change the approval workflow.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="wf-name" className="text-sm font-medium">
              Workflow name
            </label>
            <Input
              id="wf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isAdmin || isPending}
              placeholder="e.g. Standard approval"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="wf-threshold" className="text-sm font-medium">
              Auto-approve at priority
            </label>
            <Input
              id="wf-threshold"
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              disabled={!isAdmin || isPending}
              placeholder="Leave blank to disable"
            />
            <p className="text-muted-foreground text-xs">
              Requests scoring at or above this skip the chain entirely.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">Active</p>
            <p className="text-muted-foreground text-xs">
              While active, reviewers approve through the chain instead of
              directly.
            </p>
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={setIsActive}
            disabled={!isAdmin || isPending}
            aria-label="Workflow active"
          />
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-semibold">Steps</h4>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setSteps((prev) => [
                    ...prev,
                    { name: "", approver: "ROLE:REVIEWER" },
                  ])
                }
                disabled={isPending}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add step
              </Button>
            )}
          </div>

          {steps.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No steps yet. Add one to build the approval chain.
            </p>
          ) : (
            <ul className="space-y-2">
              {steps.map((step, index) => (
                <li
                  key={index}
                  className="flex flex-wrap items-end gap-2 rounded-md border p-3"
                >
                  <span className="text-muted-foreground w-6 pb-2 text-sm font-medium">
                    {index + 1}.
                  </span>
                  <div className="min-w-40 flex-1 space-y-1">
                    <label
                      htmlFor={`step-name-${index}`}
                      className="text-xs font-medium"
                    >
                      Step name
                    </label>
                    <Input
                      id={`step-name-${index}`}
                      value={step.name}
                      onChange={(e) => updateStep(index, { name: e.target.value })}
                      disabled={!isAdmin || isPending}
                      placeholder="e.g. Product review"
                    />
                  </div>
                  <div className="min-w-48 flex-1 space-y-1">
                    <label
                      htmlFor={`step-approver-${index}`}
                      className="text-xs font-medium"
                    >
                      Approver
                    </label>
                    <select
                      id={`step-approver-${index}`}
                      className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm"
                      value={step.approver}
                      onChange={(e) =>
                        updateStep(index, { approver: e.target.value })
                      }
                      disabled={!isAdmin || isPending}
                    >
                      <option value="ROLE:REVIEWER">Any reviewer</option>
                      <option value="ROLE:ADMIN">Any admin</option>
                      {members.map((m) => (
                        <option key={m.userId} value={`USER:${m.userId}`}>
                          {m.userName ?? m.userEmail}
                        </option>
                      ))}
                    </select>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 pb-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => moveStep(index, -1)}
                        disabled={index === 0 || isPending}
                        aria-label={`Move step ${index + 1} up`}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => moveStep(index, 1)}
                        disabled={index === steps.length - 1 || isPending}
                        aria-label={`Move step ${index + 1} down`}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setSteps((prev) => prev.filter((_, i) => i !== index))
                        }
                        disabled={isPending}
                        aria-label={`Remove step ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}

        {isAdmin && (
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? "Saving..." : "Save Workflow"}
            </Button>
            {workflow && (
              <Button
                variant="outline"
                onClick={handleDelete}
                disabled={isPending}
              >
                Delete
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
