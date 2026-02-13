"use client"

import { useState } from "react"
import Link from "next/link"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatusBadge } from "@/components/requests/StatusBadge"
import { PriorityBadge } from "@/components/requests/PriorityBadge"
import { VoteBadge } from "@/components/requests/VoteBadge"
import {
  ArrowRight,
  Tags,
  X,
} from "lucide-react"
import {
  bulkUpdateStatus,
  bulkAddTags,
  bulkRemoveTags,
} from "@/app/(dashboard)/bulk-actions"
import type { RequestStatus } from "@/lib/types/database"

interface RequestRow {
  id: string
  title: string
  status: RequestStatus
  priorityScore: number | null
  qualityScore: number | null
  complexity: string | null
  tags: string[]
  createdAt: string
}

interface VoteSummaryRow {
  requestId: string
  averageScore: number
  voteCount: number
}

interface BulkRequestTableProps {
  requests: RequestRow[]
  voteSummaries: VoteSummaryRow[]
  columns: ("quality" | "complexity")[]
  statusActions: { label: string; targetStatus: RequestStatus }[]
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function BulkRequestTable({
  requests,
  voteSummaries,
  columns,
  statusActions,
}: BulkRequestTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [showTagInput, setShowTagInput] = useState(false)
  const [tagInput, setTagInput] = useState("")
  const [tagMode, setTagMode] = useState<"add" | "remove">("add")

  const voteMap = new Map(voteSummaries.map((v) => [v.requestId, v]))
  const allSelected = requests.length > 0 && selected.size === requests.length

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(requests.map((r) => r.id)))
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function handleStatusChange(targetStatus: RequestStatus) {
    if (selected.size === 0) return
    setLoading(true)
    try {
      await bulkUpdateStatus([...selected], targetStatus)
      setSelected(new Set())
    } finally {
      setLoading(false)
    }
  }

  async function handleTagAction() {
    const tags = tagInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
    if (tags.length === 0 || selected.size === 0) return
    setLoading(true)
    try {
      if (tagMode === "add") {
        await bulkAddTags([...selected], tags)
      } else {
        await bulkRemoveTags([...selected], tags)
      }
      setTagInput("")
      setShowTagInput(false)
      setSelected(new Set())
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-2 py-3">
            <span className="text-sm font-medium">
              {selected.size} selected
            </span>
            <span className="text-muted-foreground">|</span>

            {statusActions.map((action) => (
              <Button
                key={action.targetStatus}
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => handleStatusChange(action.targetStatus)}
              >
                <ArrowRight className="mr-1 h-3 w-3" />
                {action.label}
              </Button>
            ))}

            {!showTagInput ? (
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => {
                  setShowTagInput(true)
                  setTagMode("add")
                }}
              >
                <Tags className="mr-1 h-3 w-3" />
                Tags
              </Button>
            ) : (
              <div className="flex items-center gap-1">
                <select
                  className="border-input bg-background h-8 rounded-md border px-2 text-xs"
                  value={tagMode}
                  onChange={(e) => setTagMode(e.target.value as "add" | "remove")}
                >
                  <option value="add">Add tags</option>
                  <option value="remove">Remove tags</option>
                </select>
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="tag1, tag2"
                  className="h-8 w-40 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      handleTagAction()
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="default"
                  disabled={loading || !tagInput.trim()}
                  onClick={handleTagAction}
                >
                  Apply
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowTagInput(false)
                    setTagInput("")
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Votes</TableHead>
              {columns.includes("quality") && <TableHead>Quality</TableHead>}
              {columns.includes("complexity") && <TableHead>Complexity</TableHead>}
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow
                key={request.id}
                className={selected.has(request.id) ? "bg-primary/5" : undefined}
              >
                <TableCell>
                  <Checkbox
                    checked={selected.has(request.id)}
                    onCheckedChange={() => toggleOne(request.id)}
                    aria-label={`Select ${request.title}`}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  <Link
                    href={`/requests/${request.id}`}
                    className="hover:underline"
                  >
                    {request.title}
                  </Link>
                  {request.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {request.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px] px-1 py-0">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={request.status} />
                </TableCell>
                <TableCell>
                  <PriorityBadge score={request.priorityScore} />
                </TableCell>
                <TableCell>
                  <VoteBadge
                    averageScore={voteMap.get(request.id)?.averageScore ?? 0}
                    voteCount={voteMap.get(request.id)?.voteCount ?? 0}
                  />
                </TableCell>
                {columns.includes("quality") && (
                  <TableCell>
                    {request.qualityScore !== null
                      ? `${request.qualityScore}%`
                      : "--"}
                  </TableCell>
                )}
                {columns.includes("complexity") && (
                  <TableCell>
                    {request.complexity ? (
                      <Badge variant="outline">{request.complexity}</Badge>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </TableCell>
                )}
                <TableCell className="text-muted-foreground">
                  {formatDate(request.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
