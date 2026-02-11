import { Card, CardContent } from "@/components/ui/card"

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="space-y-2">
        <div className="bg-muted h-7 w-28 animate-pulse rounded" />
        <div className="bg-muted h-4 w-64 animate-pulse rounded" />
      </div>

      {/* Table skeleton */}
      <Card>
        <CardContent>
          {/* Table header */}
          <div className="flex items-center gap-4 border-b pb-3">
            <div className="bg-muted h-4 w-1/3 animate-pulse rounded" />
            <div className="bg-muted h-4 w-24 animate-pulse rounded" />
            <div className="bg-muted h-4 w-20 animate-pulse rounded" />
            <div className="bg-muted h-4 w-28 animate-pulse rounded" />
          </div>

          {/* Table rows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b py-4 last:border-0">
              <div className="bg-muted h-4 w-1/3 animate-pulse rounded" />
              <div className="bg-muted h-5 w-24 animate-pulse rounded-full" />
              <div className="bg-muted h-5 w-20 animate-pulse rounded-full" />
              <div className="bg-muted h-4 w-28 animate-pulse rounded" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
