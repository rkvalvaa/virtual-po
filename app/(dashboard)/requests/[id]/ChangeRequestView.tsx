import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AttachmentsCard } from "@/components/requests/AttachmentsCard"
import { ActivityTimeline } from "@/components/requests/ActivityTimeline"
import { ChangeWorkflowPanel } from "@/components/requests/ChangeWorkflowPanel"
import { DeliveryPanel } from "@/components/requests/DeliveryPanel"
import { getDelivery } from "@/lib/export/delivery"
import { query } from "@/lib/db/pool"
import { CommentThread } from "@/components/review/CommentThread"
import { getCommentsWithAuthorByRequestId } from "@/lib/db/queries/comments"
import { getActivityByRequest } from "@/lib/db/queries/activity-log"
import { listAttachmentsByRequest } from "@/lib/db/queries/attachments"
import { getRequestSubscription, listMentionableMembers } from "@/lib/db/queries/collaboration"
import { attachmentPrefix } from "@/lib/storage/upload-authorization"
import { isBlobConfigured } from "@/lib/storage/blob"
import { canAccess } from "@/lib/auth/rbac"
import { CHANGE_FIELDS, allowedTransitions, changeWorkflow, type ChangeField } from "@/lib/workflows/change-request"
import type { FeatureRequest, UserRole } from "@/lib/types/database"

/** A change request: its workflow instead of the product lifecycle, plus shared files, discussion and activity. */
export async function ChangeRequestView({ request, userId, role }: { request: FeatureRequest; userId: string; role: UserRole }) {
  const [comments, attachments, activities, members, following, delivery] = await Promise.all([
    getCommentsWithAuthorByRequestId(request.id),
    listAttachmentsByRequest(request.id),
    getActivityByRequest(request.id),
    listMentionableMembers(request.id, request.organizationId, userId),
    getRequestSubscription(request.id, request.organizationId, userId),
    getDelivery(request.id, request.organizationId),
  ])
  const owner = (await query<{ group_name: string | null; assignee_name: string | null }>(`SELECT g.name AS group_name, COALESCE(u.name, u.email) AS assignee_name
    FROM feature_requests r LEFT JOIN service_groups g ON g.id = r.service_group_id LEFT JOIN users u ON u.id = r.assignee_id WHERE r.id = $1`, [request.id])).rows[0]
  const workflow = changeWorkflow(request.workflowVersion!)
  const state = request.workflowState!
  const recorded = request.workflowData ?? {}
  const fieldsOf = (fields: ChangeField[]) => fields.map(field => ({ field, label: CHANGE_FIELDS[field], value: recorded[field] ?? "" }))
  const actions = request.archivedAt ? [] : allowedTransitions(workflow, state, role)
    .map(t => ({ to: t.to, label: t.label, reason: t.reason, fields: fieldsOf(t.requires) }))

  return <div className="space-y-6">
    <Button variant="ghost" size="sm" asChild>
      <Link href="/requests"><ArrowLeft className="mr-1 h-4 w-4" />Back</Link>
    </Button>
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">Change request{owner?.group_name ? ` · ${owner.group_name}` : ""} · {owner?.assignee_name ? `Assigned to ${owner.assignee_name}` : "Unassigned"}</p>
      <h1 className="break-words text-2xl font-semibold">{request.title}</h1>
      {request.summary && <p className="whitespace-pre-wrap break-words text-muted-foreground">{request.summary}</p>}
    </div>
    <ChangeWorkflowPanel requestId={request.id} state={state} stateLabel={workflow.states[state as keyof typeof workflow.states] ?? state}
      version={workflow.version} actions={actions}
      details={(Object.keys(CHANGE_FIELDS) as ChangeField[]).filter(f => recorded[f]).map(f => ({ label: CHANGE_FIELDS[f], value: recorded[f]! }))} />
    {delivery && <DeliveryPanel requestId={request.id} delivery={delivery} canReplay={canAccess(role, "REVIEWER")} />}
    <AttachmentsCard requestId={request.id} uploadPrefix={attachmentPrefix(request.organizationId, request.id)} storageConfigured={isBlobConfigured()}
      attachments={attachments.map(a => ({
        id: a.id, filename: a.filename, mimeType: a.mimeType, size: a.size, uploaderName: a.uploaderName,
        createdAt: a.createdAt.toISOString(), canDelete: a.uploadedBy === userId || canAccess(role, "ADMIN"),
      }))} />
    <CommentThread requestId={request.id} members={members} following={following} comments={comments.map(c => ({
      id: c.id, content: c.content, authorName: c.authorName ?? "Unknown", parentId: c.parentId,
      createdAt: c.createdAt.toISOString(), mentionNames: c.mentionNames,
    }))} />
    <ActivityTimeline activities={activities.map(a => ({
      id: a.id, action: a.action, entityType: a.entityType ?? null, metadata: a.metadata, userName: a.userName ?? null, createdAt: a.createdAt.toISOString(),
    }))} />
  </div>
}
