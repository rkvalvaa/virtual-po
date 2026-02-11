"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface EpicViewProps {
  epic: {
    id: string
    title: string
    description: string | null
    goals: string[]
    successCriteria: string[]
    technicalNotes: string | null
  }
}

export function EpicView({ epic }: EpicViewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{epic.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {epic.description && (
          <p className="text-muted-foreground text-sm leading-relaxed">
            {epic.description}
          </p>
        )}

        {epic.goals.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Goals</h4>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
              {epic.goals.map((goal, i) => (
                <li key={i}>{goal}</li>
              ))}
            </ul>
          </div>
        )}

        {epic.successCriteria.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Success Criteria</h4>
            <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
              {epic.successCriteria.map((criterion, i) => (
                <li key={i}>{criterion}</li>
              ))}
            </ol>
          </div>
        )}

        {epic.technicalNotes && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Technical Notes</h4>
            <blockquote className="text-muted-foreground border-l-2 pl-4 text-sm italic">
              {epic.technicalNotes}
            </blockquote>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
