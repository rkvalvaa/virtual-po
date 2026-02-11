"use client"

import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface AssessmentViewProps {
  assessmentData: Record<string, unknown> | null
  businessScore: number | null
  technicalScore: number | null
  riskScore: number | null
  priorityScore: number | null
  complexity: string | null
}

function getPriorityColor(score: number): string {
  if (score >= 75) return "text-green-500"
  if (score >= 50) return "text-yellow-500"
  return "text-red-500"
}

function getPriorityLabel(score: number): string {
  if (score >= 75) return "High Priority"
  if (score >= 50) return "Medium Priority"
  return "Low Priority"
}

function getComplexityColor(complexity: string): string {
  switch (complexity.toUpperCase()) {
    case "XS":
    case "S":
      return "bg-green-500/15 text-green-600"
    case "M":
      return "bg-yellow-500/15 text-yellow-600"
    case "L":
      return "bg-orange-500/15 text-orange-600"
    case "XL":
      return "bg-red-500/15 text-red-600"
    default:
      return "bg-muted text-muted-foreground"
  }
}

function ScoreBar({
  label,
  score,
  invertColor,
}: {
  label: string
  score: number | null
  invertColor?: boolean
}) {
  if (score === null) return null

  const clamped = Math.max(0, Math.min(100, score))

  const colorClass = invertColor
    ? clamped >= 70
      ? "bg-red-500"
      : clamped >= 30
        ? "bg-yellow-500"
        : "bg-green-500"
    : clamped >= 70
      ? "bg-green-500"
      : clamped >= 30
        ? "bg-yellow-500"
        : "bg-red-500"

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{clamped}/100</span>
      </div>
      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full transition-all duration-500", colorClass)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}

export function AssessmentView({
  assessmentData,
  businessScore,
  technicalScore,
  riskScore,
  priorityScore,
  complexity,
}: AssessmentViewProps) {
  const allScoresNull =
    businessScore === null &&
    technicalScore === null &&
    riskScore === null &&
    priorityScore === null

  if (allScoresNull) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Assessment has not been completed yet.</p>
        </CardContent>
      </Card>
    )
  }

  const executiveSummary =
    typeof assessmentData?.executive_summary === "string"
      ? assessmentData.executive_summary
      : null

  const risks = Array.isArray(assessmentData?.risks)
    ? (assessmentData.risks as string[])
    : null

  const recommendations = Array.isArray(assessmentData?.recommendations)
    ? (assessmentData.recommendations as string[])
    : null

  return (
    <div className="space-y-6">
      {/* Priority Score and Complexity */}
      <Card>
        <CardContent className="flex items-center gap-6">
          <div className="flex flex-col items-center">
            {priorityScore !== null ? (
              <>
                <span className={cn("text-4xl font-bold", getPriorityColor(priorityScore))}>
                  {priorityScore}
                </span>
                <span className="text-muted-foreground text-sm">
                  {getPriorityLabel(priorityScore)}
                </span>
              </>
            ) : (
              <>
                <span className="text-muted-foreground text-4xl font-bold">--</span>
                <span className="text-muted-foreground text-sm">Not assessed</span>
              </>
            )}
          </div>
          <div className="bg-border h-12 w-px" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-muted-foreground text-xs font-medium">Complexity</span>
            <Badge
              variant="outline"
              className={cn(
                "border-transparent text-sm",
                complexity ? getComplexityColor(complexity) : "bg-muted text-muted-foreground"
              )}
            >
              {complexity ?? "Unknown"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Score Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Score Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ScoreBar label="Business Value" score={businessScore} />
          <ScoreBar label="Technical Feasibility" score={technicalScore} invertColor />
          <ScoreBar label="Risk Level" score={riskScore} invertColor />
        </CardContent>
      </Card>

      {/* Executive Summary */}
      {executiveSummary && (
        <Card>
          <CardHeader>
            <CardTitle>Executive Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm leading-relaxed">{executiveSummary}</p>
          </CardContent>
        </Card>
      )}

      {/* Risk Factors */}
      {risks && risks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Risk Factors</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
              {risks.map((risk, i) => (
                <li key={i}>{risk}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {recommendations && recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
              {recommendations.map((rec, i) => (
                <li key={i}>{rec}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
