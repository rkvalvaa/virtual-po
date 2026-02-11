"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { submitOutcome, submitActualComplexity } from "@/app/(dashboard)/requests/[id]/outcome-actions"
import type { DecisionOutcome, Complexity } from "@/lib/types/database"

interface OutcomePanelProps {
  requestId: string
  decisions: Array<{
    id: string
    decision: string
    rationale: string
    outcome: string | null
    outcomeNotes: string | null
    createdAt: string
  }>
  predictedComplexity: string | null
  actualComplexity: string | null
  actualEffortDays: number | null
  lessonsLearned: string | null
  requestStatus: string
  userRole: string
}

const OUTCOME_OPTIONS: { value: DecisionOutcome; label: string }[] = [
  { value: "CORRECT", label: "Correct" },
  { value: "PARTIALLY_CORRECT", label: "Partially Correct" },
  { value: "INCORRECT", label: "Incorrect" },
]

const OUTCOME_STYLES: Record<string, { variant: "default" | "destructive" | "outline" | "secondary"; className: string }> = {
  CORRECT: { variant: "default", className: "bg-green-600 hover:bg-green-700 text-white" },
  PARTIALLY_CORRECT: { variant: "secondary", className: "bg-yellow-500 hover:bg-yellow-600 text-white" },
  INCORRECT: { variant: "destructive", className: "" },
}

const COMPLEXITY_OPTIONS: Complexity[] = ["XS", "S", "M", "L", "XL"]

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function OutcomeRecorder({ decision }: { decision: OutcomePanelProps["decisions"][number] }) {
  const [isPending, startTransition] = useTransition()
  const [notes, setNotes] = useState("")
  const [showNotes, setShowNotes] = useState(false)

  function handleSubmit(outcome: DecisionOutcome) {
    startTransition(async () => {
      await submitOutcome(decision.id, outcome, notes.trim() || undefined)
    })
  }

  if (decision.outcome) {
    const style = OUTCOME_STYLES[decision.outcome] ?? { variant: "outline" as const, className: "" }
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant={style.variant} className={style.className}>
            {decision.outcome.replace("_", " ")}
          </Badge>
          <span className="text-muted-foreground text-xs">{formatDate(decision.createdAt)}</span>
        </div>
        <p className="text-muted-foreground text-sm">{decision.decision}: {decision.rationale}</p>
        {decision.outcomeNotes && (
          <p className="text-muted-foreground text-xs italic">Notes: {decision.outcomeNotes}</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{decision.decision}</Badge>
          <span className="text-muted-foreground text-xs">{formatDate(decision.createdAt)}</span>
        </div>
        <p className="text-muted-foreground text-sm line-clamp-2">{decision.rationale}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {OUTCOME_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => handleSubmit(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowNotes(!showNotes)}
          disabled={isPending}
        >
          {showNotes ? "Hide Notes" : "Add Notes"}
        </Button>
      </div>
      {showNotes && (
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes about the outcome..."
          className="text-sm"
        />
      )}
    </div>
  )
}

function ComplexityCalibration({
  requestId,
  predictedComplexity,
  actualComplexity,
  actualEffortDays,
  lessonsLearned,
}: {
  requestId: string
  predictedComplexity: string | null
  actualComplexity: string | null
  actualEffortDays: number | null
  lessonsLearned: string | null
}) {
  const [isPending, startTransition] = useTransition()
  const [selectedComplexity, setSelectedComplexity] = useState<Complexity | null>(null)
  const [effortDays, setEffortDays] = useState("")
  const [lessons, setLessons] = useState("")

  if (actualComplexity) {
    const matches = predictedComplexity === actualComplexity
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Predicted:</span>{" "}
            <Badge variant="outline">{predictedComplexity ?? "N/A"}</Badge>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Actual:</span>{" "}
            <Badge variant="outline">{actualComplexity}</Badge>
          </div>
          <Badge variant={matches ? "default" : "destructive"} className={matches ? "bg-green-600 text-white" : ""}>
            {matches ? "Match" : "Mismatch"}
          </Badge>
        </div>
        {actualEffortDays !== null && (
          <p className="text-muted-foreground text-sm">Actual effort: {actualEffortDays} days</p>
        )}
        {lessonsLearned && (
          <p className="text-muted-foreground text-sm italic">Lessons: {lessonsLearned}</p>
        )}
      </div>
    )
  }

  function handleSave() {
    if (!selectedComplexity) return
    startTransition(async () => {
      await submitActualComplexity(
        requestId,
        selectedComplexity,
        effortDays ? Number(effortDays) : undefined,
        lessons.trim() || undefined
      )
    })
  }

  return (
    <div className="space-y-3">
      <div className="text-sm">
        <span className="text-muted-foreground">Predicted complexity:</span>{" "}
        <Badge variant="outline">{predictedComplexity ?? "N/A"}</Badge>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Actual Complexity</p>
        <div className="flex gap-2">
          {COMPLEXITY_OPTIONS.map((c) => (
            <Button
              key={c}
              variant={selectedComplexity === c ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedComplexity(c)}
              disabled={isPending}
            >
              {c}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Actual Effort (days)</p>
        <Input
          type="number"
          min={0}
          step={0.5}
          value={effortDays}
          onChange={(e) => setEffortDays(e.target.value)}
          placeholder="e.g. 5"
          className="w-32"
          disabled={isPending}
        />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Lessons Learned</p>
        <Textarea
          value={lessons}
          onChange={(e) => setLessons(e.target.value)}
          placeholder="What was different from the estimate?"
          className="text-sm"
          disabled={isPending}
        />
      </div>
      <Button
        size="sm"
        onClick={handleSave}
        disabled={!selectedComplexity || isPending}
      >
        {isPending ? "Saving..." : "Save"}
      </Button>
    </div>
  )
}

export function OutcomePanel({
  requestId,
  decisions,
  predictedComplexity,
  actualComplexity,
  actualEffortDays,
  lessonsLearned,
  requestStatus,
  userRole,
}: OutcomePanelProps) {
  const isReviewer = userRole === "REVIEWER" || userRole === "ADMIN"
  const showCalibration = requestStatus === "COMPLETED" || requestStatus === "IN_PROGRESS"

  if (!isReviewer) return null
  if (decisions.length === 0 && !showCalibration) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Outcome Tracking</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {decisions.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Decision Outcomes</h4>
            {decisions.map((d) => (
              <OutcomeRecorder key={d.id} decision={d} />
            ))}
          </div>
        )}

        {decisions.length > 0 && showCalibration && <Separator />}

        {showCalibration && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Estimation Calibration</h4>
            <ComplexityCalibration
              requestId={requestId}
              predictedComplexity={predictedComplexity}
              actualComplexity={actualComplexity}
              actualEffortDays={actualEffortDays}
              lessonsLearned={lessonsLearned}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
