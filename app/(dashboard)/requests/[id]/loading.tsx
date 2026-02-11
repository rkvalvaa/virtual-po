import { Card, CardContent, CardHeader } from "@/components/ui/card"

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Back button */}
      <div className="bg-muted h-9 w-24 animate-pulse rounded" />

      {/* Title and status badge */}
      <div className="flex items-center gap-4">
        <div className="bg-muted h-8 w-72 animate-pulse rounded" />
        <div className="bg-muted h-6 w-28 animate-pulse rounded-full" />
      </div>

      {/* Tab bar */}
      <div className="flex gap-4 border-b pb-2">
        <div className="bg-muted h-8 w-20 animate-pulse rounded" />
        <div className="bg-muted h-8 w-24 animate-pulse rounded" />
        <div className="bg-muted h-8 w-20 animate-pulse rounded" />
      </div>

      {/* Content card */}
      <Card>
        <CardHeader>
          <div className="bg-muted h-5 w-36 animate-pulse rounded" />
          <div className="bg-muted h-4 w-56 animate-pulse rounded" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted h-4 w-full animate-pulse rounded" />
          <div className="bg-muted h-4 w-full animate-pulse rounded" />
          <div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
          <div className="bg-muted mt-4 h-4 w-full animate-pulse rounded" />
          <div className="bg-muted h-4 w-5/6 animate-pulse rounded" />
        </CardContent>
      </Card>
    </div>
  )
}
