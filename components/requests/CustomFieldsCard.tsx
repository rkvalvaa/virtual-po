"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updateCustomFields } from "@/app/(dashboard)/requests/[id]/actions"
import type { CustomFieldType } from "@/lib/types/database"

interface CustomFieldDefinitionView {
  id: string
  name: string
  key: string
  type: CustomFieldType
  options: string[]
  required: boolean
}

export interface CustomFieldsCardProps {
  requestId: string
  definitions: CustomFieldDefinitionView[]
  values: Record<string, string | number | null>
  canEdit: boolean
}

function toInputValue(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value)
}

export function CustomFieldsCard({
  requestId,
  definitions,
  values,
  canEdit,
}: CustomFieldsCardProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  function startEditing() {
    setDraft(
      Object.fromEntries(definitions.map((d) => [d.key, toInputValue(values[d.key])]))
    )
    setErrors({})
    setFormError(null)
    setEditing(true)
  }

  async function handleSave() {
    setSaving(true)
    setFormError(null)
    try {
      const result = await updateCustomFields(requestId, draft)
      if (result.success) {
        setEditing(false)
        setErrors({})
      } else {
        setErrors(result.errors)
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to save custom fields")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Custom Fields</CardTitle>
          {canEdit && !editing && (
            <Button size="sm" variant="outline" onClick={startEditing}>
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {formError && <p className="text-destructive text-sm">{formError}</p>}

        {definitions.map((def) => {
          const inputId = `custom-field-${def.key}`
          const error = errors[def.key]
          return (
            <div key={def.id} className="space-y-1">
              <label className="text-sm font-medium" htmlFor={inputId}>
                {def.name}
                {def.required && <span className="text-destructive ml-1">*</span>}
              </label>

              {!editing ? (
                <p className="text-muted-foreground text-sm">
                  {toInputValue(values[def.key]) || "--"}
                </p>
              ) : def.type === "SELECT" ? (
                <select
                  id={inputId}
                  className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm"
                  value={draft[def.key] ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [def.key]: e.target.value }))
                  }
                >
                  <option value="">--</option>
                  {def.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={inputId}
                  type={
                    def.type === "NUMBER"
                      ? "number"
                      : def.type === "DATE"
                        ? "date"
                        : "text"
                  }
                  value={draft[def.key] ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [def.key]: e.target.value }))
                  }
                />
              )}

              {error && <p className="text-destructive text-sm">{error}</p>}
            </div>
          )
        })}

        {editing && (
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
