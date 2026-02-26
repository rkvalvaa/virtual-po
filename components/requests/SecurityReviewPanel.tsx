"use client"

import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Info,
  ChevronDown,
} from "lucide-react"
import { useState } from "react"

interface SecurityCategory {
  id: string
  severity: string
  reasoning: string
  recommendations: string[]
}

interface SecurityReviewPanelProps {
  review: {
    categories: SecurityCategory[]
    overallSeverity: string
    summary: string
    recommendations: string[]
    requiresSecurityReview: boolean
    gaps: string[]
    createdAt: string | Date
  } | null
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case "critical":
      return "text-red-600 dark:text-red-400"
    case "high":
      return "text-orange-600 dark:text-orange-400"
    case "medium":
      return "text-yellow-600 dark:text-yellow-400"
    case "low":
      return "text-blue-600 dark:text-blue-400"
    default:
      return "text-green-600 dark:text-green-400"
  }
}

function getSeverityBg(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-red-500/15 text-red-600 dark:text-red-400"
    case "high":
      return "bg-orange-500/15 text-orange-600 dark:text-orange-400"
    case "medium":
      return "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400"
    case "low":
      return "bg-blue-500/15 text-blue-600 dark:text-blue-400"
    default:
      return "bg-green-500/15 text-green-600 dark:text-green-400"
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  pii: "PII / Personal Data",
  auth: "Authentication",
  authz: "Authorization / Access Control",
  "data-storage": "Data Storage & Encryption",
  "api-security": "API Security",
  "third-party": "Third-Party Integration",
  "file-upload": "File Upload / Processing",
  payments: "Payments & Financial Data",
  "logging-audit": "Logging & Audit Trail",
  infrastructure: "Infrastructure & Deployment",
  "data-exposure": "Data Exposure / Leakage",
  compliance: "Regulatory Compliance",
}

function CategoryCard({ category }: { category: SecurityCategory }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border p-4">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn("border-transparent text-xs", getSeverityBg(category.severity))}
          >
            {category.severity}
          </Badge>
          <span className="text-sm font-medium">
            {CATEGORY_LABELS[category.id] ?? category.id}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "text-muted-foreground size-4 transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <p className="text-muted-foreground text-sm">{category.reasoning}</p>
          {category.recommendations.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recommendations
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {category.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function SecurityReviewPanel({ review }: SecurityReviewPanelProps) {
  if (!review) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">
            Security review has not been performed yet.
          </p>
        </CardContent>
      </Card>
    )
  }

  const noSecurityConcerns =
    !review.requiresSecurityReview && review.overallSeverity === "none"

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardContent className="flex items-center gap-4">
          <div
            className={cn(
              "flex size-12 items-center justify-center rounded-full",
              noSecurityConcerns ? "bg-green-100 dark:bg-green-950/60" : "bg-red-100 dark:bg-red-950/60"
            )}
          >
            {noSecurityConcerns ? (
              <ShieldCheck className="size-6 text-green-600 dark:text-green-400" />
            ) : (
              <ShieldAlert
                className={cn("size-6", getSeverityColor(review.overallSeverity))}
              />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">Security Review</span>
              <Badge
                variant="outline"
                className={cn(
                  "border-transparent text-xs",
                  getSeverityBg(review.overallSeverity)
                )}
              >
                {review.overallSeverity === "none"
                  ? "Clear"
                  : review.overallSeverity.charAt(0).toUpperCase() +
                    review.overallSeverity.slice(1)}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{review.summary}</p>
          </div>
        </CardContent>
      </Card>

      {/* Categories */}
      {review.categories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-amber-500" />
              Security Categories ({review.categories.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {review.categories.map((cat) => (
              <CategoryCard key={cat.id} category={cat} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {review.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {review.recommendations.map((rec, i) => (
                <li key={i}>{rec}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Gaps */}
      {review.gaps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="size-4 text-blue-500" />
              Information Gaps
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {review.gaps.map((gap, i) => (
                <li key={i}>{gap}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
