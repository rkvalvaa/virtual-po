import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/auth/session"
import { getFeatureRequestById } from "@/lib/db/queries/feature-requests"
import { getEpicByRequestId, getStoriesByEpicId } from "@/lib/db/queries/epics"
import { getDecisionsByRequestId } from "@/lib/db/queries/decisions"
import { getCommentsWithAuthorByRequestId } from "@/lib/db/queries/comments"
import { findSimilarByKeywords } from "@/lib/db/queries/outcomes"
import { getIntegrationByType } from "@/lib/db/queries/jira-sync"
import { getVoteByUser, getVotesByRequest, getVoteSummary } from "@/lib/db/queries/votes"
import { RequestDetail } from "./RequestDetail"
import "@/lib/auth/types"

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

  const [epic, decisions, comments, similarResults, jiraIntegration, linearIntegration, currentVote, allVotes, voteSummary] = await Promise.all([
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
  ])
  const stories = epic ? await getStoriesByEpicId(epic.id) : []

  return (
    <RequestDetail
      request={{
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
        createdAt: request.createdAt.toISOString(),
        updatedAt: request.updatedAt.toISOString(),
      }}
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
      }))}
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
    />
  )
}
