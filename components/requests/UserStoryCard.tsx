"use client"

import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface UserStoryCardProps {
  story: {
    id: string
    title: string
    asA: string
    iWant: string
    soThat: string
    acceptanceCriteria: string[]
    technicalNotes: string | null
    priority: number
    storyPoints: number | null
  }
}

function getPriorityBadgeClass(priority: number): string {
  switch (priority) {
    case 1:
      return "bg-red-500/15 text-red-600 border-transparent"
    case 2:
      return "bg-orange-500/15 text-orange-600 border-transparent"
    case 3:
      return "bg-yellow-500/15 text-yellow-600 border-transparent"
    default:
      return ""
  }
}

export function UserStoryCard({ story }: UserStoryCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="flex-1 text-base">{story.title}</CardTitle>
          <Badge
            variant="outline"
            className={cn(getPriorityBadgeClass(story.priority))}
          >
            P{story.priority}
          </Badge>
          {story.storyPoints !== null && (
            <Badge variant="secondary">{story.storyPoints} pts</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm leading-relaxed">
          <p>
            As a <span className="font-semibold">{story.asA}</span>,
          </p>
          <p>
            I want <span className="font-semibold">{story.iWant}</span>,
          </p>
          <p>
            So that <span className="font-semibold">{story.soThat}</span>.
          </p>
        </div>

        {story.acceptanceCriteria.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Acceptance Criteria</h4>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
              {story.acceptanceCriteria.map((criterion, i) => (
                <li key={i}>{criterion}</li>
              ))}
            </ul>
          </div>
        )}

        {story.technicalNotes && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Technical Notes</h4>
            <p className="text-muted-foreground text-xs">{story.technicalNotes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
