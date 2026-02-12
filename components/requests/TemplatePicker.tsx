"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Bug, Sparkles, TrendingUp, Plug, FileText } from "lucide-react"

interface Template {
  id: string
  name: string
  description: string | null
  category: string
  icon: string | null
  defaultTitle: string | null
  promptHints: string[]
}

interface TemplatePickerProps {
  templates: Template[]
  onSelect: (template: Template) => void
  onSkip: () => void
}

const ICON_MAP: Record<string, React.ReactNode> = {
  bug: <Bug className="h-6 w-6" />,
  sparkles: <Sparkles className="h-6 w-6" />,
  "trending-up": <TrendingUp className="h-6 w-6" />,
  plug: <Plug className="h-6 w-6" />,
}

const CATEGORY_COLORS: Record<string, string> = {
  BUG_FIX: "border-red-200 dark:border-red-900",
  NEW_FEATURE: "border-blue-200 dark:border-blue-900",
  IMPROVEMENT: "border-green-200 dark:border-green-900",
  INTEGRATION: "border-purple-200 dark:border-purple-900",
  CUSTOM: "border-gray-200 dark:border-gray-800",
}

export function TemplatePicker({ templates, onSelect, onSkip }: TemplatePickerProps) {
  return (
    <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight">What type of request?</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Choose a template to get started, or skip to start from scratch.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map((template) => (
            <Card
              key={template.id}
              className={`cursor-pointer transition-shadow hover:shadow-md ${CATEGORY_COLORS[template.category] ?? ""}`}
              onClick={() => onSelect(template)}
            >
              <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                <div className="text-muted-foreground">
                  {ICON_MAP[template.icon ?? ""] ?? <FileText className="h-6 w-6" />}
                </div>
                <CardTitle className="text-base">{template.name}</CardTitle>
              </CardHeader>
              <CardContent>
                {template.description && (
                  <CardDescription className="text-sm">
                    {template.description}
                  </CardDescription>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center">
          <Button variant="ghost" onClick={onSkip}>
            Skip — start from scratch
          </Button>
        </div>
      </div>
    </div>
  )
}
