import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/auth/session"
import { getFeatureRequestById } from "@/lib/db/queries/feature-requests"
import { getEpicByRequestId, getStoriesByEpicId } from "@/lib/db/queries/epics"
import { getDecisionsByRequestId } from "@/lib/db/queries/decisions"
import { getCommentsWithAuthorByRequestId } from "@/lib/db/queries/comments"
import { findSimilarByKeywords } from "@/lib/db/queries/outcomes"
import { getIntegrationByType } from "@/lib/db/queries/jira-sync"
import { getExportStatus } from '@/lib/export/durable'
import { getVoteByUser, getVotesByRequest, getVoteSummary } from "@/lib/db/queries/votes"
import { getActivityByRequest } from "@/lib/db/queries/activity-log"
import { listCustomFieldDefinitions } from "@/lib/db/queries/custom-fields"
import { listAttachmentsByRequest } from "@/lib/db/queries/attachments"
import { listDocumentContext } from '@/lib/documents/context'
import { canAccess } from "@/lib/auth/rbac"
import {
  getActiveWorkflow,
  listRequestApprovalsWithApprover,
} from "@/lib/db/queries/approval-workflows"
import { getOrganizationUsers } from "@/lib/db/queries/organizations"
import { getRequestSubscription, listMentionableMembers } from '@/lib/db/queries/collaboration'
import { getApprovalState, canActOnStep } from "@/lib/approvals/engine"
import type { RequestStatus, UserRole } from "@/lib/types/database"
import type { ApprovalChainStep } from "@/components/review/ApprovalChain"
import { RequestDetail } from "./RequestDetail"
import { ArchiveControl } from '@/components/requests/ArchiveControl'
import "@/lib/auth/types"

/** Statuses reached before review — no approval chain to show yet. */
const PRE_REVIEW_STATUSES: RequestStatus[] = [
  "DRAFT",
  "INTAKE_IN_PROGRESS",
  "PENDING_ASSESSMENT",
]

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireAuth()
  const { id } = await params

  const request = await getFeatureRequestById(id)

  if (!request || request.organizationId !== session.user.orgId) {
    notFound()
  }

  // Extract keywords from title for similarity search (words with 3+ chars)
  const keywords = request.title
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())
    .filter((w) => w.length >= 3)

  const keywordCount = keywords.length

  const [epic, decisions, comments, similarResults, jiraIntegration, linearIntegration, currentVote, allVotes, voteSummary, activities, customFieldDefinitions, attachments, approvalWorkflow, approvals, mentionableMembers, following] = await Promise.all([
    getEpicByRequestId(request.id),
    getDecisionsByRequestId(request.id),
    getCommentsWithAuthorByRequestId(request.id),
    keywordCount > 0
      ? findSimilarByKeywords(session.user.orgId!, keywords, request.id, 5)
      : Promise.resolve([]),
    session.user.orgId
      ? getIntegrationByType(session.user.orgId, "JIRA")
      : Promise.resolve(null),
    session.user.orgId
      ? getIntegrationByType(session.user.orgId, "LINEAR")
      : Promise.resolve(null),
    getVoteByUser(request.id, session.user.id),
    getVotesByRequest(request.id),
    getVoteSummary(request.id),
    getActivityByRequest(request.id),
    session.user.orgId
      ? listCustomFieldDefinitions(session.user.orgId)
      : Promise.resolve([]),
    listAttachmentsByRequest(request.id),
    session.user.orgId
      ? getActiveWorkflow(session.user.orgId)
      : Promise.resolve(null),
    listRequestApprovalsWithApprover(request.id),
    listMentionableMembers(request.id, request.organizationId, session.user.id),
    getRequestSubscription(request.id, request.organizationId, session.user.id),
  ])
  const stories = epic ? await getStoriesByEpicId(epic.id) : []
  const documentSelections = await listDocumentContext(request.id, request.organizationId, session.user.id)
  const [exports, githubIntegration] = await Promise.all([
    getExportStatus(request.id, request.organizationId),
    getIntegrationByType(request.organizationId, 'GITHUB_ISSUES'),
  ])

  // An active workflow with no steps is no gate at all — treat it as absent.
  const hasApprovalChain =
    approvalWorkflow !== null &&
    approvalWorkflow.steps.length > 0 &&
    !PRE_REVIEW_STATUSES.includes(request.status)

  let approvalChain: ApprovalChainStep[] = []
  if (hasApprovalChain && approvalWorkflow) {
    const state = getApprovalState(approvalWorkflow, approvals)
    const namedApproverIds = approvalWorkflow.steps
      .map((s) => s.approverUserId)
      .filter((id): id is string => id !== null)
    const memberNames = new Map<string, string>()
    if (namedApproverIds.length > 0 && session.user.orgId) {
      for (const member of await getOrganizationUsers(session.user.orgId)) {
        memberNames.set(member.userId, member.user.name ?? member.user.email)
      }
    }

    approvalChain = state.steps.map(({ step, status }) => {
      const approval = approvals.find((a) => a.stepId === step.id)
      return {
        stepId: step.id,
        stepOrder: step.stepOrder,
        name: step.name,
        approverLabel: step.approverUserId
          ? (memberNames.get(step.approverUserId) ?? "Assigned approver")
          : step.approverRole === "ADMIN"
            ? "Any admin"
            : "Any reviewer",
        status,
        approverName: approval?.approverName ?? null,
        decidedAt: approval?.createdAt.toISOString() ?? null,
        rationale: approval?.rationale ?? null,
        canAct:
          !request.archivedAt &&
          status === "PENDING" &&
          request.status === "UNDER_REVIEW" &&
          canActOnStep(step, session.user.id, session.user.role as UserRole),
      }
    })
  }

  return (
    <>
    <ArchiveControl requestId={request.id} archived={!!request.archivedAt}
      canManage={canAccess(session.user.role as UserRole, 'REVIEWER') || (request.requesterId === session.user.id && request.status === 'DRAFT')} />
    <RequestDetail
      request={{
        archived: !!request.archivedAt,
        id: request.id,
        title: request.title,
        summary: request.summary,
        status: request.status,
        intakeData: request.intakeData,
        intakeComplete: request.intakeComplete,
        qualityScore: request.qualityScore,
        assessmentData: request.assessmentData,
        businessScore: request.businessScore,
        technicalScore: request.technicalScore,
        riskScore: request.riskScore,
        priorityScore: request.priorityScore,
        complexity: request.complexity,
        actualComplexity: request.actualComplexity,
        actualEffortDays: request.actualEffortDays,
        lessonsLearned: request.lessonsLearned,
        customFields: request.customFields,
        createdAt: request.createdAt.toISOString(),
        updatedAt: request.updatedAt.toISOString(),
      }}
      customFieldDefinitions={customFieldDefinitions.map((f) => ({
        id: f.id,
        name: f.name,
        key: f.key,
        type: f.type,
        options: f.options,
        required: f.required,
      }))}
      canEditCustomFields={
        !request.archivedAt && (request.requesterId === session.user.id ||
        canAccess(session.user.role as UserRole, "REVIEWER"))
      }
      attachments={attachments.map((a) => ({
        context: documentSelections.find(selection => selection.attachmentId === a.id),
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
        uploaderName: a.uploaderName,
        createdAt: a.createdAt.toISOString(),
        canDelete:
          a.uploadedBy === session.user.id ||
          canAccess(session.user.role as UserRole, "ADMIN"),
      }))}
      epic={
        epic
          ? {
              id: epic.id,
              title: epic.title,
              description: epic.description,
              goals: epic.goals,
              successCriteria: epic.successCriteria,
              technicalNotes: epic.technicalNotes,
            }
          : null
      }
      stories={stories.map((story) => ({
        id: story.id,
        title: story.title,
        asA: story.asA,
        iWant: story.iWant,
        soThat: story.soThat,
        acceptanceCriteria: story.acceptanceCriteria,
        technicalNotes: story.technicalNotes,
        priority: story.priority,
        storyPoints: story.storyPoints,
      }))}
      decisions={decisions.map((d) => ({
        id: d.id,
        decision: d.decision,
        rationale: d.rationale,
        outcome: d.outcome ?? null,
        outcomeNotes: d.outcomeNotes ?? null,
        userId: d.userId,
        createdAt: d.createdAt.toISOString(),
      }))}
      comments={comments.map((c) => ({
        id: c.id,
        content: c.content,
        authorName: c.authorName ?? "Unknown",
        parentId: c.parentId,
        createdAt: c.createdAt.toISOString(),
        mentionNames: c.mentionNames,
      }))}
      mentionableMembers={mentionableMembers}
      following={following}
      similarRequests={similarResults.map((sr) => ({
        id: sr.id,
        title: sr.title,
        priorityScore: sr.priorityScore ?? null,
        complexity: sr.complexity ?? null,
        similarityScore: keywordCount > 0 ? sr.relevanceScore / keywordCount : 0,
      }))}
      userRole={session.user.role}
      requestId={request.id}
      jiraEpicKey={epic?.jiraEpicKey ?? null}
      jiraEpicUrl={epic?.jiraEpicUrl ?? null}
      hasJiraIntegration={jiraIntegration !== null}
      linearProjectId={epic?.linearProjectId ?? null}
      linearProjectUrl={epic?.linearProjectUrl ?? null}
      hasLinearIntegration={linearIntegration !== null}
      exportResults={exports}
      hasGitHubIntegration={githubIntegration !== null}
      githubIssueUrl={epic?.githubIssueUrl ?? null}
      currentVote={
        currentVote
          ? { voteValue: currentVote.voteValue, rationale: currentVote.rationale }
          : null
      }
      votes={allVotes.map((v) => ({
        voteValue: v.voteValue,
        rationale: v.rationale,
        userName: v.userName,
        createdAt: v.createdAt.toISOString(),
      }))}
      voteSummary={{
        voteCount: voteSummary.voteCount,
        averageScore: voteSummary.averageScore,
      }}
      approvalWorkflowName={hasApprovalChain ? (approvalWorkflow?.name ?? null) : null}
      approvalChain={approvalChain}
      activities={activities.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType ?? null,
        metadata: a.metadata,
        userName: a.userName ?? null,
        createdAt: a.createdAt.toISOString(),
      }))}
    />
    </>
  )
}
