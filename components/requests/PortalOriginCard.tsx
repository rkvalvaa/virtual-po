import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PortalOrigin } from "@/lib/db/queries/feature-requests"

/** Internal view of a request that arrived through the client portal. */
export function PortalOriginCard({ origin }: { origin: PortalOrigin }) {
  const contact = [origin.contactName, origin.contactEmail].filter(Boolean).join(" · ")
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Submitted through the client portal</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <dt className="text-muted-foreground">Client</dt><dd className="break-words">{origin.clientName ?? "Removed client"}</dd>
          <dt className="text-muted-foreground">Contact</dt><dd className="break-words">{contact || "Removed contact"}</dd>
          <dt className="text-muted-foreground">Form</dt><dd className="break-words">{origin.formTitle ?? "Removed form"}{origin.formVersion ? ` (version ${origin.formVersion})` : ""}</dd>
          <dt className="text-muted-foreground">Reference</dt><dd className="font-mono">{origin.reference}</dd>
        </dl>
        <dl className="space-y-2 border-t pt-3">
          {origin.answers.map(answer => <div key={answer.key}>
            <dt className="text-muted-foreground">{answer.label}</dt>
            <dd className="whitespace-pre-line break-words">{answer.value === null ? "Not answered" : String(answer.value)}</dd>
          </div>)}
        </dl>
      </CardContent>
    </Card>
  )
}
