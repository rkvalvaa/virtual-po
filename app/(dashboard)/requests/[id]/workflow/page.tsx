import Link from "next/link"
import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/auth/session"
import { getFeatureRequestById } from "@/lib/db/queries/feature-requests"
import { getEpicByRequestId, getStoriesByEpicId } from "@/lib/db/queries/epics"
import { getSecurityReviewByRequestId } from "@/lib/db/queries/security-reviews"
import { getAgentMessages } from "@/lib/agents/history"
import type { AgentStage } from "@/lib/agents/runs"
import { query } from "@/lib/db/pool"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { QualityIndicator } from "@/components/chat/QualityIndicator"
import { MessageBubble } from "@/components/chat/MessageBubble"
import { WorkflowPanel } from "@/components/requests/WorkflowPanel"

export default async function RequestWorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  const { id } = await params
  const request = await getFeatureRequestById(id)
  if (!request || request.organizationId !== session.user.orgId ||
    (request.requesterId !== session.user.id && !["ADMIN", "REVIEWER"].includes(session.user.role))) notFound()
  const [epic, security, runs] = await Promise.all([
    getEpicByRequestId(id), getSecurityReviewByRequestId(id),
    query(`SELECT agent, status, result_complete, expires_at > clock_timestamp() AS live FROM agent_runs
      WHERE request_id = $1 ORDER BY created_at DESC`, [id]),
  ])
  const stories = epic ? await getStoriesByEpicId(epic.id) : []
  const stages: { id: AgentStage; title: string; done: boolean }[] = [
    { id: "intake", title: "Intake Agent", done: request.intakeComplete },
    { id: "assessment", title: "Assessment", done: request.assessmentData !== null },
    { id: "security", title: "Security review", done: security !== null },
    { id: "output", title: "Epic and stories", done: epic !== null && stories.length > 0 && runs.rows.some(run => run.agent === "output" && run.result_complete) },
  ]
  const terminal = !["DRAFT", "INTAKE_IN_PROGRESS", "PENDING_ASSESSMENT", "UNDER_REVIEW", "APPROVED"].includes(request.status)
  const liveRun = runs.rows.find(run => run.status === "RUNNING" && run.live)
  const next = terminal ? undefined : liveRun ? stages.find(stage => stage.id === liveRun.agent) : stages.find(stage => !stage.done)
  const scope = { requestId: id, orgId: request.organizationId, userId: session.user.id }
  const history = await Promise.all(stages.map(stage => getAgentMessages({ ...scope, agent: stage.id })))
  const running = runs.rows.some(run => run.status === "RUNNING" && run.live)
  const latest = next ? runs.rows.find(run => run.agent === next.id) : undefined
  const hints = Array.isArray(request.intakeData._template_hints)
    ? request.intakeData._template_hints.filter((hint): hint is string => typeof hint === "string")
    : ["Describe the problem and who it affects.", "Include constraints, examples, and success criteria."]

  return <div className="mx-auto w-full max-w-6xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="min-w-0 break-words text-2xl font-bold">{request.title}</h1>
      <Button asChild variant="outline" className="h-auto max-w-full whitespace-normal py-2"><Link href={`/requests/${id}`}>View request and results</Link></Button>
    </div>
    <ol className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Request workflow">
      {stages.map(stage => <li key={stage.id} className="min-w-0 rounded-lg border p-3 text-sm [overflow-wrap:anywhere]">
        <p className="font-medium">{stage.id === "intake" ? "Intake" : stage.title}</p>
        <p className="text-muted-foreground">{stage.done ? "Completed" : runs.rows.some(run => run.agent === stage.id && run.status === "RUNNING" && run.live) ? "Running" : next?.id === stage.id ? "Ready" : "Pending"}</p>
      </li>)}
    </ol>
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <Card className="min-w-0 overflow-hidden py-0">
        <CardHeader className="border-b py-4"><CardTitle>{next?.title ?? (terminal && stages.some(stage => !stage.done) ? "Workflow not active" : "Workflow complete")}</CardTitle></CardHeader>
        {next ? <>
          {latest && !(latest.status === "RUNNING" && latest.live) && <p role="status" className="px-4 pt-3 text-sm text-muted-foreground">
            {latest.status === "FAILED" ? "The last attempt did not finish. Your saved progress is safe; retry below." : "This stage still needs saved results. Continue below to finish it."}
          </p>}
          <WorkflowPanel requestId={id} stage={next.id} messages={history[stages.indexOf(next)]} running={running}
            retryAvailable={Boolean(latest && (latest.status === "FAILED" || (latest.status === "RUNNING" && !latest.live)))} />
        </> : <CardContent className="py-6">{terminal ? "This request is no longer in an editable workflow stage." : `Assessment, security review, and ${stories.length} user stories are saved. Open the request to review the results.`}</CardContent>}
      </Card>
      <Card className="h-fit"><CardHeader><CardTitle className="text-sm">Saved progress</CardTitle></CardHeader>
        <CardContent className="space-y-4"><QualityIndicator score={request.qualityScore ?? 0} />
          {!request.intakeComplete && <ul className="list-disc space-y-2 pl-4 text-sm text-muted-foreground">{hints.map((hint, index) => <li key={index}>{hint}</li>)}</ul>}
        </CardContent>
      </Card>
    </div>
    {stages.map((stage, index) => stage.id !== next?.id && history[index].length > 0 && <details key={stage.id} className="rounded-lg border p-4">
      <summary className="cursor-pointer font-medium">Saved {stage.id} conversation</summary>
      <div className="mt-4 space-y-4">{history[index].map(message => <MessageBubble key={message.id} message={message} />)}</div>
    </details>)}
  </div>
}
