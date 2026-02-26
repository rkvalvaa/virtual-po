"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ArrowRightLeft,
  MessageSquare,
  Gavel,
  ThumbsUp,
  ClipboardCheck,
  BookOpen,
  FileText,
  Tag,
  TagIcon,
  PlusCircle,
  Pencil,
} from "lucide-react"
import type { ActivityAction } from "@/lib/types/database"

interface ActivityEntry {
  id: string
  action: string
  entityType: string | null
  metadata: Record<string, unknown>
  userName: string | null
  createdAt: string
}

interface ActivityTimelineProps {
  activities: ActivityEntry[]
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diffMs = now - date
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) return "just now"
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 30) return `${diffDays}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

const ACTION_CONFIG: Record<ActivityAction, { icon: typeof ArrowRightLeft; label: string; color: string }> = {
  STATUS_CHANGED: { icon: ArrowRightLeft, label: "Status changed", color: "text-blue-500" },
  COMMENT_ADDED: { icon: MessageSquare, label: "Comment added", color: "text-green-500" },
  DECISION_MADE: { icon: Gavel, label: "Decision made", color: "text-purple-500" },
  VOTE_CAST: { icon: ThumbsUp, label: "Vote cast", color: "text-orange-500" },
  ASSESSMENT_COMPLETED: { icon: ClipboardCheck, label: "Assessment completed", color: "text-teal-500" },
  EPIC_CREATED: { icon: BookOpen, label: "Epic created", color: "text-indigo-500" },
  STORY_CREATED: { icon: FileText, label: "Story created", color: "text-indigo-400" },
  TAG_ADDED: { icon: Tag, label: "Tag added", color: "text-emerald-500" },
  TAG_REMOVED: { icon: TagIcon, label: "Tag removed", color: "text-red-400" },
  REQUEST_CREATED: { icon: PlusCircle, label: "Request created", color: "text-green-600" },
  REQUEST_UPDATED: { icon: Pencil, label: "Request updated", color: "text-yellow-500" },
}

function getActionDescription(activity: ActivityEntry): string {
  const meta = activity.metadata
  const actor = activity.userName ?? "System"

  switch (activity.action) {
    case "STATUS_CHANGED":
      return `${actor} changed status from ${meta.from ?? "unknown"} to ${meta.to ?? "unknown"}`
    case "COMMENT_ADDED":
      return `${actor} added a comment`
    case "DECISION_MADE":
      return `${actor} made a decision: ${meta.decision ?? "unknown"}`
    case "VOTE_CAST":
      return `${actor} cast a vote${meta.value ? ` (${meta.value}/5)` : ""}`
    case "ASSESSMENT_COMPLETED":
      return `${actor} completed the assessment`
    case "EPIC_CREATED":
      return `${actor} created epic: ${meta.title ?? ""}`
    case "STORY_CREATED":
      return `${actor} created story: ${meta.title ?? ""}`
    case "TAG_ADDED":
      return `${actor} added tag "${meta.tag ?? ""}"`
    case "TAG_REMOVED":
      return `${actor} removed tag "${meta.tag ?? ""}"`
    case "REQUEST_CREATED":
      return `${actor} created this request`
    case "REQUEST_UPDATED":
      return `${actor} updated the request`
    default:
      return `${actor} performed an action`
  }
}

function groupByDate(activities: ActivityEntry[]): Map<string, ActivityEntry[]> {
  const groups = new Map<string, ActivityEntry[]>()
  for (const activity of activities) {
    const dateKey = new Date(activity.createdAt).toDateString()
    const existing = groups.get(dateKey) ?? []
    existing.push(activity)
    groups.set(dateKey, existing)
  }
  return groups
}

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  if (activities.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground text-sm">No activity recorded yet.</p>
        </CardContent>
      </Card>
    )
  }

  const grouped = groupByDate(activities)

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([dateKey, entries]) => (
        <div key={dateKey} className="space-y-3">
          <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            {formatDate(entries[0].createdAt)}
          </div>
          <div className="space-y-1">
            {entries.map((activity) => {
              const config = ACTION_CONFIG[activity.action as ActivityAction] ?? {
                icon: PlusCircle,
                label: activity.action,
                color: "text-muted-foreground",
              }
              const Icon = config.icon

              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50"
                >
                  <div className={`mt-0.5 flex-shrink-0 ${config.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{getActionDescription(activity)}</p>
                    {activity.action === "STATUS_CHANGED" && activity.metadata.to != null && (
                      <Badge variant="secondary" className="mt-1 text-xs">
                        {String(activity.metadata.to)}
                      </Badge>
                    )}
                    {activity.action === "DECISION_MADE" && activity.metadata.rationale != null && (
                      <p className="text-muted-foreground mt-1 text-xs line-clamp-2">
                        {String(activity.metadata.rationale)}
                      </p>
                    )}
                  </div>
                  <span className="text-muted-foreground flex-shrink-0 text-xs">
                    {formatRelativeTime(activity.createdAt)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
