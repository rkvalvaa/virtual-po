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
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import {
  addCustomField,
  editCustomField,
  moveCustomField,
  removeCustomField,
} from "@/app/(dashboard)/settings/custom-field-actions"
import { CUSTOM_FIELD_TYPES, type CustomFieldType } from "@/lib/types/database"

interface CustomFieldRow {
  id: string
  name: string
  key: string
  type: CustomFieldType
  options: string[]
  required: boolean
}

export interface CustomFieldSettingsProps {
  customFields: CustomFieldRow[]
  userRole: string
}

const TYPE_LABELS: Record<CustomFieldType, string> = {
  TEXT: "Text",
  NUMBER: "Number",
  SELECT: "Dropdown",
  DATE: "Date",
}

function parseOptions(text: string): string[] {
  return text
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
}

export function CustomFieldSettings({ customFields, userRole }: CustomFieldSettingsProps) {
  const isAdmin = userRole === "ADMIN"
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [type, setType] = useState<CustomFieldType>("TEXT")
  const [optionsText, setOptionsText] = useState("")
  const [required, setRequired] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editOptionsText, setEditOptionsText] = useState("")
  const [editRequired, setEditRequired] = useState(false)

  async function run(action: () => Promise<void>) {
    setSaving(true)
    setError(null)
    try {
      await action()
      return true
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleAdd() {
    const ok = await run(() =>
      addCustomField({
        name: name.trim(),
        type,
        options: type === "SELECT" ? parseOptions(optionsText) : [],
        required,
      })
    )
    if (!ok) return
    setShowForm(false)
    setName("")
    setType("TEXT")
    setOptionsText("")
    setRequired(false)
  }

  function startEdit(field: CustomFieldRow) {
    setEditingId(field.id)
    setEditName(field.name)
    setEditOptionsText(field.options.join(", "))
    setEditRequired(field.required)
    setError(null)
  }

  async function handleSaveEdit(field: CustomFieldRow) {
    const ok = await run(() =>
      editCustomField(field.id, {
        name: editName.trim(),
        options: field.type === "SELECT" ? parseOptions(editOptionsText) : [],
        required: editRequired,
      })
    )
    if (ok) setEditingId(null)
  }

  async function handleDelete(field: CustomFieldRow) {
    if (
      !window.confirm(
        `Delete "${field.name}"? Values already saved on requests will stop being shown.`
      )
    ) {
      return
    }
    await run(() => removeCustomField(field.id))
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Custom Fields</CardTitle>
            <CardDescription>
              {customFields.length} field{customFields.length !== 1 ? "s" : ""} configured.
              Custom fields appear on every request and in the CSV export.
            </CardDescription>
          </div>
          {isAdmin && !showForm && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Add Field
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-destructive text-sm">{error}</p>}

        {showForm && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="custom-field-name">
                  Name
                </label>
                <Input
                  id="custom-field-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Business Unit"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="custom-field-type">
                  Type
                </label>
                <select
                  id="custom-field-type"
                  className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm"
                  value={type}
                  onChange={(e) => setType(e.target.value as CustomFieldType)}
                >
                  {CUSTOM_FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {type === "SELECT" && (
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="custom-field-options">
                  Options (comma separated)
                </label>
                <Input
                  id="custom-field-options"
                  value={optionsText}
                  onChange={(e) => setOptionsText(e.target.value)}
                  placeholder="Platform, Growth, Billing"
                />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
              />
              Required
            </label>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={saving || !name.trim()}>
                {saving ? "Saving..." : "Save Field"}
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

        {customFields.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Options</TableHead>
                <TableHead>Required</TableHead>
                {isAdmin && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {customFields.map((field, index) => (
                <TableRow key={field.id}>
                  {editingId === field.id ? (
                    <TableCell colSpan={isAdmin ? 6 : 5}>
                      <div className="space-y-3">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Field name"
                        />
                        {field.type === "SELECT" && (
                          <Input
                            value={editOptionsText}
                            onChange={(e) => setEditOptionsText(e.target.value)}
                            placeholder="Options (comma separated)"
                          />
                        )}
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={editRequired}
                            onChange={(e) => setEditRequired(e.target.checked)}
                          />
                          Required
                        </label>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSaveEdit(field)}
                            disabled={saving || !editName.trim()}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingId(null)}
                            disabled={saving}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  ) : (
                    <>
                      <TableCell className="font-medium">{field.name}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {field.key}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{TYPE_LABELS[field.type]}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {field.options.length > 0 ? field.options.join(", ") : "--"}
                      </TableCell>
                      <TableCell>
                        {field.required ? (
                          <Badge variant="secondary">Required</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">Optional</span>
                        )}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Move ${field.name} up`}
                              disabled={saving || index === 0}
                              onClick={() => run(() => moveCustomField(field.id, "up"))}
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Move ${field.name} down`}
                              disabled={saving || index === customFields.length - 1}
                              onClick={() => run(() => moveCustomField(field.id, "down"))}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => startEdit(field)}
                              disabled={saving}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              aria-label={`Delete ${field.name}`}
                              onClick={() => handleDelete(field)}
                              disabled={saving}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No custom fields yet.
            {isAdmin ? " Add one to capture organization-specific data on requests." : ""}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
