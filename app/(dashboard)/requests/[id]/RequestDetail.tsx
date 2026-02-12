"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AssessmentView } from "@/components/requests/AssessmentView"
import { EpicView } from "@/components/requests/EpicView"
import { StoryList } from "@/components/requests/StoryList"
import { StatusBadge } from "@/components/requests/StatusBadge"
import { PriorityBadge } from "@/components/requests/PriorityBadge"
import { SimilarRequests } from "@/components/requests/SimilarRequests"
import { DecisionPanel } from "@/components/review/DecisionPanel"
import { OutcomePanel } from "@/components/review/OutcomePanel"
import { CommentThread } from "@/components/review/CommentThread"
import { QualityIndicator } from "@/components/chat/QualityIndicator"
import { JiraSyncButton } from "@/components/requests/JiraSyncButton"
import { ArrowLeft } from "lucide-react"

interface RequestDetailProps {
  request: {
    id: string
    title: string
    summary: string | null
    status: string
    intakeData: Record<string, unknown>
    intakeComplete: boolean
    qualityScore: number | null
    assessmentData: Record<string, unknown> | null
    businessScore: number | null
    technicalScore: number | null
    riskScore: number | null
    priorityScore: number | null
    complexity: string | null
    actualComplexity: string | null
    actualEffortDays: number | null
    lessonsLearned: string | null
    createdAt: string
    updatedAt: string
  }
  epic: {
    id: string
    title: string
    description: string | null
    goals: string[]
    successCriteria: string[]
    technicalNotes: string | null
  } | null
  stories: Array<{
    id: string
    title: string
    asA: string
    iWant: string
    soThat: string
    acceptanceCriteria: string[]
    technicalNotes: string | null
    priority: number
    storyPoints: number | null
  }>
  decisions: Array<{
    id: string
    decision: string
    rationale: string
    outcome: string | null
    outcomeNotes: string | null
    userId: string
    createdAt: string
  }>
  comments: Array<{
    id: string
    content: string
    authorName: string
    parentId: string | null
    createdAt: string
  }>
  similarRequests: Array<{
    id: string
    title: string
    priorityScore: number | null
    complexity: string | null
    similarityScore: number
  }>
  userRole: string
  requestId: string
  jiraEpicKey: string | null
  jiraEpicUrl: string | null
  hasJiraIntegration: boolean
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatIntakeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim()
}

function renderIntakeValue(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return value.join(", ")
  if (value === null || value === undefined) return "--"
  return JSON.stringify(value, null, 2)
}

export function RequestDetail({
  request,
  epic,
  stories,
  decisions,
  comments,
  similarRequests,
  userRole,
  requestId,
  jiraEpicKey,
  jiraEpicUrl,
  hasJiraIntegration,
}: RequestDetailProps) {
  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" asChild>
        <Link href="/requests">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Requests
        </Link>
      </Button>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{request.title}</h1>
          <StatusBadge status={request.status} />
          <PriorityBadge score={request.priorityScore} />
          {request.complexity && (
            <Badge variant="outline">Complexity: {request.complexity}</Badge>
          )}
        </div>
        <div className="text-muted-foreground flex gap-4 text-sm">
          <span>Created: {formatDate(request.createdAt)}</span>
          <span>Updated: {formatDate(request.updatedAt)}</span>
        </div>
      </div>

      {/* Decision Panel */}
      <DecisionPanel
        requestId={request.id}
        currentStatus={request.status}
        userRole={userRole}
        decisions={decisions}
      />

      {/* Outcome Panel */}
      {decisions.length > 0 && (
        <OutcomePanel
          requestId={request.id}
          decisions={decisions}
          predictedComplexity={request.complexity}
          actualComplexity={request.actualComplexity}
          actualEffortDays={request.actualEffortDays}
          lessonsLearned={request.lessonsLearned}
          requestStatus={request.status}
          userRole={userRole}
        />
      )}

      {/* Similar Requests */}
      <SimilarRequests similarRequests={similarRequests} />

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="assessment">Assessment</TabsTrigger>
          <TabsTrigger value="epic-stories">Epic & Stories</TabsTrigger>
          <TabsTrigger value="discussion">
            Discussion
            {comments.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">
                {comments.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {request.summary && (
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {request.summary}
                </p>
              </CardContent>
            </Card>
          )}

          {request.qualityScore !== null && (
            <Card>
              <CardHeader>
                <CardTitle>Intake Quality</CardTitle>
              </CardHeader>
              <CardContent>
                <QualityIndicator score={request.qualityScore} />
              </CardContent>
            </Card>
          )}

          {Object.keys(request.intakeData).length > 0 && (
            <div className="space-y-4">
              {Object.entries(request.intakeData).map(([key, value]) => (
                <Card key={key}>
                  <CardHeader>
                    <CardTitle className="text-base">{formatIntakeKey(key)}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground whitespace-pre-wrap text-sm">
                      {renderIntakeValue(value)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Assessment Tab */}
        <TabsContent value="assessment" className="space-y-6">
          <AssessmentView
            assessmentData={request.assessmentData}
            businessScore={request.businessScore}
            technicalScore={request.technicalScore}
            riskScore={request.riskScore}
            priorityScore={request.priorityScore}
            complexity={request.complexity}
          />
        </TabsContent>

        {/* Epic & Stories Tab */}
        <TabsContent value="epic-stories" className="space-y-6">
          {epic ? (
            <>
              <EpicView epic={epic} />
              <JiraSyncButton
                requestId={requestId}
                jiraEpicKey={jiraEpicKey}
                jiraEpicUrl={jiraEpicUrl}
                hasJiraIntegration={hasJiraIntegration}
              />
              <StoryList stories={stories} />
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No epic has been generated yet.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Discussion Tab */}
        <TabsContent value="discussion" className="space-y-6">
          <CommentThread comments={comments} requestId={request.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
