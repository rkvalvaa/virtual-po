import { Card, CardContent, CardHeader } from "@/components/ui/card"

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="space-y-2">
        <div className="bg-muted h-7 w-28 animate-pulse rounded" />
        <div className="bg-muted h-4 w-56 animate-pulse rounded" />
      </div>

      {/* Tab bar */}
      <div className="flex gap-4 border-b pb-2">
        <div className="bg-muted h-8 w-20 animate-pulse rounded" />
        <div className="bg-muted h-8 w-24 animate-pulse rounded" />
        <div className="bg-muted h-8 w-28 animate-pulse rounded" />
      </div>

      {/* Settings card */}
      <Card>
        <CardHeader>
          <div className="bg-muted h-5 w-32 animate-pulse rounded" />
          <div className="bg-muted h-4 w-64 animate-pulse rounded" />
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Form field skeletons */}
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="bg-muted h-4 w-24 animate-pulse rounded" />
              <div className="bg-muted h-9 w-full animate-pulse rounded" />
            </div>
          ))}
          {/* Save button */}
          <div className="bg-muted h-9 w-24 animate-pulse rounded" />
        </CardContent>
      </Card>
    </div>
  )
}
