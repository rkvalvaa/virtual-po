"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface SimilarRequest {
  id: string
  title: string
  priorityScore: number | null
  complexity: string | null
  similarityScore: number
}

interface SimilarRequestsProps {
  similarRequests: SimilarRequest[]
}

export function SimilarRequests({ similarRequests }: SimilarRequestsProps) {
  if (similarRequests.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Similar Requests</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {similarRequests.map((req) => (
          <Link
            key={req.id}
            href={`/requests/${req.id}`}
            className="block rounded-md border p-3 transition-colors hover:bg-accent"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium line-clamp-1">{req.title}</p>
              <Badge variant="secondary" className="shrink-0">
                {Math.round(req.similarityScore * 100)}%
              </Badge>
            </div>
            <div className="mt-1.5 flex gap-2">
              {req.priorityScore !== null && (
                <Badge variant="outline" className="text-xs">
                  Priority: {req.priorityScore}
                </Badge>
              )}
              {req.complexity && (
                <Badge variant="outline" className="text-xs">
                  {req.complexity}
                </Badge>
              )}
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}
