"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AssessmentView } from "@/components/requests/AssessmentView"
import { DocumentCitations } from '@/components/requests/DocumentCitations'
import { EpicView } from "@/components/requests/EpicView"
import { StoryList } from "@/components/requests/StoryList"
import { StatusBadge } from "@/components/requests/StatusBadge"
import { PriorityBadge } from "@/components/requests/PriorityBadge"
import { SimilarRequests } from "@/components/requests/SimilarRequests"
import { DecisionPanel } from "@/components/review/DecisionPanel"
import { ApprovalChain, type ApprovalChainStep } from "@/components/review/ApprovalChain"
import { OutcomePanel } from "@/components/review/OutcomePanel"
import { CommentThread } from "@/components/review/CommentThread"
import { QualityIndicator } from "@/components/chat/QualityIndicator"
import { JiraSyncButton } from "@/components/requests/JiraSyncButton"
import { LinearSyncButton } from "@/components/requests/LinearSyncButton"
import { TrackerExport } from '@/components/requests/TrackerExport'
import type { ExportResult } from '@/lib/export/durable'
import { VoteWidget } from "@/components/requests/VoteWidget"
import { ActivityTimeline } from "@/components/requests/ActivityTimeline"
import { CustomFieldsCard } from "@/components/requests/CustomFieldsCard"
import type { CustomFieldsCardProps } from "@/components/requests/CustomFieldsCard"
import { AttachmentsCard } from "@/components/requests/AttachmentsCard"
import type { AttachmentView } from "@/components/requests/AttachmentsCard"
import { ArrowLeft, FileDown } from "lucide-react"
import { assessmentScoringPolicy } from '@/config/scoring-policy'
import type { MentionableMember } from '@/lib/db/queries/collaboration'

interface RequestDetailProps {
  request: {
    archived?: boolean
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
    customFields: Record<string, string | number | null>
    createdAt: string
    updatedAt: string
  }
  customFieldDefinitions: CustomFieldsCardProps["definitions"]
  canEditCustomFields: boolean
  attachments: AttachmentView[]
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
    mentionNames: string[]
  }>
  mentionableMembers: MentionableMember[]
  following: boolean
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
  linearProjectId: string | null
  linearProjectUrl: string | null
  hasLinearIntegration: boolean
  hasGitHubIntegration?: boolean
  githubIssueUrl?: string | null
  exportResults?: Array<ExportResult & { provider: string }>
  currentVote: {
    voteValue: number
    rationale: string | null
  } | null
  votes: Array<{
    voteValue: number
    rationale: string | null
    userName: string | null
    createdAt: string
  }>
  voteSummary: {
    voteCount: number
    averageScore: number
  }
  activities: Array<{
    id: string
    action: string
    entityType: string | null
    metadata: Record<string, unknown>
    userName: string | null
    createdAt: string
  }>
  /** Null when the org has no active approval workflow with steps. */
  approvalWorkflowName: string | null
  approvalChain: ApprovalChainStep[]
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
  customFieldDefinitions,
  canEditCustomFields,
  attachments,
  epic,
  stories,
  decisions,
  comments,
  mentionableMembers,
  following,
  similarRequests,
  userRole,
  requestId,
  jiraEpicKey,
  jiraEpicUrl,
  hasJiraIntegration,
  linearProjectId,
  linearProjectUrl,
  hasLinearIntegration,
  hasGitHubIntegration = false,
  githubIssueUrl,
  exportResults = [],
  currentVote,
  votes,
  voteSummary,
  activities,
  approvalWorkflowName,
  approvalChain,
}: RequestDetailProps) {
  const hasApprovalChain = approvalWorkflowName !== null && approvalChain.length > 0
  return (
    <div className="space-y-6">
      {/* Back button + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/requests">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Requests
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={`/api/export/requests/${request.id}/pdf`} download>
            <FileDown className="mr-1 h-4 w-4" />
            Download PDF
          </a>
        </Button>
      </div>

      {/* Header */}
      {canEditCustomFields && <Button variant="outline" className="h-auto max-w-full whitespace-normal" asChild><Link href={`/requests/${request.id}/edit`}>Refine request / reassess</Link></Button>}
      {canEditCustomFields && <Button className="h-auto max-w-full whitespace-normal" asChild><Link href={`/requests/${request.id}/workflow`}>
        {request.intakeComplete ? "Continue request workflow" : "Resume intake"}
      </Link></Button>}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{request.title}</h1>
          <StatusBadge status={request.status} />
          <PriorityBadge score={request.priorityScore} config={assessmentScoringPolicy(request.assessmentData).config} />
          {request.complexity && (
            <Badge variant="outline">Complexity: {request.complexity}</Badge>
          )}
        </div>
        <div className="text-muted-foreground flex flex-wrap gap-4 text-sm">
          <span>Created: {formatDate(request.createdAt)}</span>
          <span>Updated: {formatDate(request.updatedAt)}</span>
        </div>
      </div>

      {/* Approval chain (replaces direct approve/reject while active) */}
      {hasApprovalChain && (
        <ApprovalChain
          requestId={request.id}
          workflowName={approvalWorkflowName}
          steps={approvalChain}
        />
      )}

      {/* Decision Panel */}
      <DecisionPanel
        requestId={request.id}
        currentStatus={request.status}
        userRole={userRole}
        decisions={decisions}
        hasApprovalChain={hasApprovalChain}
        readOnly={request.archived}
      />

      {/* Outcome Panel */}
      {decisions.length > 0 && (
        <OutcomePanel
          readOnly={request.archived}
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

      {/* Stakeholder Voting */}
      <VoteWidget
        readOnly={request.archived}
        requestId={request.id}
        currentVote={currentVote}
        votes={votes}
        summary={voteSummary}
      />

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <div className="min-w-0 overflow-x-auto p-1">
        <TabsList aria-label="Request details">
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
          <TabsTrigger value="activity">
            Activity
            {activities.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">
                {activities.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
        </div>

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

          {customFieldDefinitions.length > 0 && (
            <CustomFieldsCard
              requestId={request.id}
              definitions={customFieldDefinitions}
              values={request.customFields}
              canEdit={canEditCustomFields}
            />
          )}

          <AttachmentsCard requestId={request.id} attachments={attachments} canSelectContext={canEditCustomFields} />

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
          <DocumentCitations value={request.assessmentData?.documentCitations} attachmentIds={attachments.map(attachment => attachment.id)} omissions={request.assessmentData?.documentOmissions} />
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
                initial={exportResults.find(result => result.provider === 'JIRA')}
                canExport={!request.archived && (userRole === 'ADMIN' || userRole === 'REVIEWER')}
              />
              <LinearSyncButton
                requestId={requestId}
                linearProjectId={linearProjectId}
                linearProjectUrl={linearProjectUrl}
                hasLinearIntegration={hasLinearIntegration}
                initial={exportResults.find(result => result.provider === 'LINEAR')}
                canExport={!request.archived && (userRole === 'ADMIN' || userRole === 'REVIEWER')}
              />
              {hasGitHubIntegration && <TrackerExport requestId={requestId} provider="GITHUB_ISSUES" url={githubIssueUrl} initial={exportResults.find(result => result.provider === 'GITHUB_ISSUES')} canExport={!request.archived && (userRole === 'ADMIN' || userRole === 'REVIEWER')} />}
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
          <CommentThread comments={comments} requestId={request.id} members={mentionableMembers} following={following} />
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-6">
          <ActivityTimeline activities={activities} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
