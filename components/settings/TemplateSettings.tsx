"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Bug, Sparkles, TrendingUp, Plug, FileText, Plus, Trash2 } from "lucide-react"
import { addTemplate, editTemplate, removeTemplate } from "@/app/(dashboard)/settings/template-actions"
import type { TemplateCategory } from "@/lib/types/database"

interface TemplateRow {
  id: string
  name: string
  description: string | null
  category: string
  icon: string | null
  defaultTitle: string | null
  promptHints: string[]
  isActive: boolean
  sortOrder: number
}

export interface TemplateSettingsProps {
  templates: TemplateRow[]
  userRole: string
}

const ICON_MAP: Record<string, React.ReactNode> = {
  bug: <Bug className="h-4 w-4" />,
  sparkles: <Sparkles className="h-4 w-4" />,
  "trending-up": <TrendingUp className="h-4 w-4" />,
  plug: <Plug className="h-4 w-4" />,
}

const CATEGORIES: { value: TemplateCategory; label: string }[] = [
  { value: "BUG_FIX", label: "Bug Fix" },
  { value: "NEW_FEATURE", label: "New Feature" },
  { value: "IMPROVEMENT", label: "Improvement" },
  { value: "INTEGRATION", label: "Integration" },
  { value: "CUSTOM", label: "Custom" },
]

export function TemplateSettings({ templates, userRole }: TemplateSettingsProps) {
  const isAdmin = userRole === "ADMIN"
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState<TemplateCategory>("CUSTOM")
  const [icon, setIcon] = useState("")
  const [defaultTitle, setDefaultTitle] = useState("")
  const [hintsText, setHintsText] = useState("")

  async function handleAdd() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const promptHints = hintsText
        .split("\n")
        .map((h) => h.trim())
        .filter(Boolean)
      await addTemplate({
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        icon: icon.trim() || undefined,
        defaultTitle: defaultTitle.trim() || undefined,
        promptHints: promptHints.length > 0 ? promptHints : undefined,
      })
      setShowForm(false)
      setName("")
      setDescription("")
      setCategory("CUSTOM")
      setIcon("")
      setDefaultTitle("")
      setHintsText("")
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(id: string, currentlyActive: boolean) {
    await editTemplate(id, { isActive: !currentlyActive })
  }

  async function handleDelete(id: string) {
    await removeTemplate(id)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Request Templates</CardTitle>
            <CardDescription>
              {templates.length} template{templates.length !== 1 ? "s" : ""} configured.
              Templates guide stakeholders when creating new requests.
            </CardDescription>
          </div>
          {isAdmin && !showForm && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Add Template
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Performance Issue"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Category</label>
                <select
                  className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TemplateCategory)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Description</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this template type"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Icon</label>
                <Input
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="bug, sparkles, trending-up, plug"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Default Title Prefix</label>
                <Input
                  value={defaultTitle}
                  onChange={(e) => setDefaultTitle(e.target.value)}
                  placeholder="e.g. Bug: "
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Prompt Hints (one per line)</label>
              <Textarea
                value={hintsText}
                onChange={(e) => setHintsText(e.target.value)}
                placeholder={"What problem does this solve?\nWho are the primary users?"}
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={saving || !name.trim()}>
                {saving ? "Saving..." : "Save Template"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {templates.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Hints</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((tmpl) => (
                <TableRow key={tmpl.id}>
                  <TableCell>
                    <span className="text-muted-foreground">
                      {ICON_MAP[tmpl.icon ?? ""] ?? <FileText className="h-4 w-4" />}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{tmpl.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{tmpl.category.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {tmpl.promptHints.length}
                  </TableCell>
                  <TableCell>
                    <Badge variant={tmpl.isActive ? "default" : "secondary"}>
                      {tmpl.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleActive(tmpl.id, tmpl.isActive)}
                        >
                          {tmpl.isActive ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => handleDelete(tmpl.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No templates configured. Default templates will be created automatically.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
