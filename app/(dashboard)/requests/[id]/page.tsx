import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/auth/session"
import { getFeatureRequestById } from "@/lib/db/queries/feature-requests"
import { getEpicByRequestId, getStoriesByEpicId } from "@/lib/db/queries/epics"
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

  const epic = await getEpicByRequestId(request.id)
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
    />
  )
}
