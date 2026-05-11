"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SimilarRequestsPanel } from "@/components/requests/SimilarRequestsPanel"
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
  onSelect: (template: Template, titleOverride?: string) => void
  onSkip: (titleOverride?: string) => void
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
  const [title, setTitle] = useState("")
  const trimmedTitle = title.trim()
  const titleOverride = trimmedTitle.length > 0 ? trimmedTitle : undefined

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-8">
      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight">What type of request?</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Give it a working title — we&apos;ll check for similar existing requests.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="request-title" className="text-sm">
              Working title (optional)
            </Label>
            <Input
              id="request-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Add dark mode toggle"
              autoComplete="off"
            />
          </div>
          <SimilarRequestsPanel title={title} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map((template) => (
            <Card
              key={template.id}
              className={`cursor-pointer transition-shadow hover:shadow-md ${CATEGORY_COLORS[template.category] ?? ""}`}
              onClick={() => onSelect(template, titleOverride)}
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
          <Button variant="ghost" onClick={() => onSkip(titleOverride)}>
            Skip — start from scratch
          </Button>
        </div>
      </div>
    </div>
  )
}
