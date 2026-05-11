"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/requests/StatusBadge"
import { findSimilarToTitle } from "@/app/(dashboard)/requests/new/actions"
import type { SimilarRequest } from "@/lib/db/queries/feature-requests"
import { Loader2, AlertTriangle } from "lucide-react"

interface SimilarRequestsPanelProps {
  title: string
}

const DEBOUNCE_MS = 350

export function SimilarRequestsPanel({ title }: SimilarRequestsPanelProps) {
  const [snapshot, setSnapshot] = useState<{ title: string; results: SimilarRequest[] }>(
    { title: '', results: [] },
  )
  const [isPending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const trimmed = title.trim()

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (trimmed.length < 4) return

    let cancelled = false
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const matches = await findSimilarToTitle(trimmed)
        if (!cancelled) setSnapshot({ title: trimmed, results: matches })
      })
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [trimmed])

  if (trimmed.length < 4) return null

  // Only show results when they match the current trimmed title (avoids
  // flashing stale matches while a new debounced query is in flight).
  const results = snapshot.title === trimmed ? snapshot.results : []

  if (isPending && results.length === 0) {
    return (
      <div
        className="text-muted-foreground flex items-center gap-2 text-xs"
        role="status"
        aria-label="Checking for similar requests"
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking for similar requests...
      </div>
    )
  }

  if (results.length === 0) return null

  return (
    <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/30">
      <CardContent className="space-y-2 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-100">
          <AlertTriangle className="h-4 w-4" />
          {results.length === 1
            ? "1 similar request already exists"
            : `${results.length} similar requests already exist`}
        </div>
        <ul className="space-y-1.5">
          {results.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <Link
                href={`/requests/${r.id}`}
                className="flex-1 truncate hover:underline"
              >
                {r.title}
              </Link>
              <span className="text-muted-foreground text-xs tabular-nums">
                {Math.round(r.similarity * 100)}%
              </span>
              <StatusBadge status={r.status} />
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">
          Open one to see if your request is already covered, or continue below to create a new one.
        </p>
      </CardContent>
    </Card>
  )
}
