"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { replayChangeDelivery } from "@/app/(dashboard)/requests/[id]/change-workflow-actions"
import type { Delivery } from "@/lib/export/delivery"

/** Where this change request's Linear delivery stands; reviewers can replay a stuck one. */
export function DeliveryPanel({ requestId, delivery, canReplay }: { requestId: string; delivery: Delivery; canReplay: boolean }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const replayable = canReplay && (delivery.status === "NEEDS_ATTENTION" || delivery.status === "FAILED")

  async function replay() {
    setPending(true)
    setError("")
    const result = await replayChangeDelivery(requestId)
    setPending(false)
    if (result.error) { setError(result.error); return }
    router.refresh()
  }

  return <Card>
    <CardHeader><CardTitle className="text-base">Delivery</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-sm">
      <p className="font-medium">{label(delivery)}</p>
      {delivery.url && <a href={delivery.url} target="_blank" rel="noreferrer" className="underline">Open in Linear</a>}
      {delivery.status !== "DELIVERED" && delivery.error && <p className="break-words text-muted-foreground">{delivery.error}</p>}
      {replayable && <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void replay()}>Replay delivery</Button>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </CardContent>
  </Card>
}

function label(delivery: Delivery): string {
  switch (delivery.status) {
    case "DELIVERED": return "Delivered to Linear"
    case "NEEDS_ATTENTION": return "Needs attention"
    case "FAILED": return `Failed after ${delivery.attempts} attempts`
    case "QUEUED": return delivery.attempts && delivery.nextAttemptAt
      ? `Queued for Linear, retrying after ${new Date(delivery.nextAttemptAt).toLocaleString()}`
      : "Queued for Linear"
  }
}
