"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { ExternalLink } from "lucide-react"
import { syncEpicToLinear } from "@/app/(dashboard)/settings/linear-actions"

interface LinearSyncButtonProps {
  requestId: string
  linearProjectId: string | null
  linearProjectUrl: string | null
  hasLinearIntegration: boolean
}

export function LinearSyncButton({
  requestId,
  linearProjectId,
  linearProjectUrl,
  hasLinearIntegration,
}: LinearSyncButtonProps) {
  const [isPending, startTransition] = useTransition()

  if (!hasLinearIntegration) {
    return null
  }

  if (linearProjectId) {
    return (
      <a
        href={linearProjectUrl ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        View in Linear
      </a>
    )
  }

  function handleSync() {
    startTransition(async () => {
      await syncEpicToLinear(requestId)
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={handleSync}
    >
      {isPending ? "Syncing..." : "Push to Linear"}
    </Button>
  )
}
