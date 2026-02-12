"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { ExternalLink } from "lucide-react"
import { syncEpicToJira } from "@/app/(dashboard)/settings/jira-actions"

interface JiraSyncButtonProps {
  requestId: string
  jiraEpicKey: string | null
  jiraEpicUrl: string | null
  hasJiraIntegration: boolean
}

export function JiraSyncButton({
  requestId,
  jiraEpicKey,
  jiraEpicUrl,
  hasJiraIntegration,
}: JiraSyncButtonProps) {
  const [isPending, startTransition] = useTransition()

  if (!hasJiraIntegration) {
    return null
  }

  if (jiraEpicKey) {
    return (
      <a
        href={jiraEpicUrl ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        {jiraEpicKey}
      </a>
    )
  }

  function handleSync() {
    startTransition(async () => {
      await syncEpicToJira(requestId)
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={handleSync}
    >
      {isPending ? "Syncing..." : "Push to Jira"}
    </Button>
  )
}
