"use client"

import { Badge } from "@/components/ui/badge"
import { UserStoryCard } from "@/components/requests/UserStoryCard"

interface StoryListProps {
  stories: Array<{
    id: string
    title: string
    asA: string
    iWant: string
    soThat: string
    acceptanceCriteria: string[]
    technicalNotes: string | null
    priority: number
    storyPoints: number | null
  }>
}

export function StoryList({ stories }: StoryListProps) {
  const sortedStories = [...stories].sort((a, b) => a.priority - b.priority)

  const totalPoints = stories.reduce(
    (sum, story) => sum + (story.storyPoints ?? 0),
    0
  )
  const hasAnyPoints = stories.some((story) => story.storyPoints !== null)

  if (stories.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground">
          No user stories have been generated yet.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-lg font-semibold">User Stories</h3>
        <Badge variant="secondary">{stories.length} stories</Badge>
        {hasAnyPoints && (
          <span className="text-muted-foreground text-sm">
            {totalPoints} total points
          </span>
        )}
      </div>

      <div className="space-y-3">
        {sortedStories.map((story) => (
          <UserStoryCard key={story.id} story={story} />
        ))}
      </div>
    </div>
  )
}
