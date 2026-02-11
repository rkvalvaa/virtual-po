"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import {
  createOkrObjective,
  updateOkrObjective,
  deleteOkrObjective,
  createOkrKeyResult,
  updateOkrKeyResult,
  deleteOkrKeyResult,
} from "@/app/(dashboard)/settings/okr-actions"

interface OkrSettingsProps {
  objectives: Array<{
    id: string
    title: string
    description: string | null
    timeFrame: string
    status: string
    keyResults: Array<{
      id: string
      title: string
      targetValue: number
      currentValue: number
      unit: string
    }>
  }>
  userRole: string
}

const STATUS_STYLES: Record<string, { variant: "default" | "secondary" | "outline"; className: string }> = {
  ACTIVE: { variant: "default", className: "bg-green-600 hover:bg-green-700 text-white" },
  COMPLETED: { variant: "secondary", className: "" },
  CANCELLED: { variant: "destructive" as "default", className: "bg-red-600 hover:bg-red-700 text-white" },
}

function generateQuarters(): string[] {
  const now = new Date()
  const year = now.getFullYear()
  const currentQ = Math.ceil((now.getMonth() + 1) / 3)
  const quarters: string[] = []
  for (let y = year; y <= year + 1; y++) {
    for (let q = 1; q <= 4; q++) {
      if (y === year && q < currentQ) continue
      quarters.push(`${y}-Q${q}`)
    }
  }
  return quarters
}

function AddObjectiveDialog({
  onSuccess,
}: {
  onSuccess: () => void
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const quarters = generateQuarters()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createOkrObjective(formData)
      if (result.success) {
        setOpen(false)
        onSuccess()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add Objective</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Objective</DialogTitle>
          <DialogDescription>
            Create a new OKR objective for your organization.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="obj-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="obj-title"
              name="title"
              placeholder="e.g. Increase user engagement"
              required
              disabled={isPending}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="obj-desc" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="obj-desc"
              name="description"
              placeholder="Optional description..."
              disabled={isPending}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="obj-timeframe" className="text-sm font-medium">
              Time Frame
            </label>
            <Select name="timeFrame" required>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select quarter" />
              </SelectTrigger>
              <SelectContent>
                {quarters.map((q) => (
                  <SelectItem key={q} value={q}>
                    {q}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Creating..." : "Create Objective"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddKeyResultDialog({
  objectiveId,
  onSuccess,
}: {
  objectiveId: string
  onSuccess: () => void
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("objectiveId", objectiveId)
    startTransition(async () => {
      const result = await createOkrKeyResult(formData)
      if (result.success) {
        setOpen(false)
        onSuccess()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Add Key Result
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Key Result</DialogTitle>
          <DialogDescription>
            Define a measurable key result for this objective.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="kr-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="kr-title"
              name="title"
              placeholder="e.g. Reach 1000 daily active users"
              required
              disabled={isPending}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="kr-target" className="text-sm font-medium">
                Target Value
              </label>
              <Input
                id="kr-target"
                name="targetValue"
                type="number"
                min={1}
                placeholder="e.g. 1000"
                required
                disabled={isPending}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="kr-unit" className="text-sm font-medium">
                Unit
              </label>
              <Input
                id="kr-unit"
                name="unit"
                placeholder="e.g. users, %, points"
                required
                disabled={isPending}
              />
            </div>
          </div>
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Creating..." : "Create Key Result"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditObjectiveDialog({
  objective,
  onSuccess,
}: {
  objective: { id: string; title: string; description: string | null; timeFrame: string; status: string }
  onSuccess: () => void
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const quarters = generateQuarters()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("id", objective.id)
    startTransition(async () => {
      const result = await updateOkrObjective(formData)
      if (result.success) {
        setOpen(false)
        onSuccess()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Objective</DialogTitle>
          <DialogDescription>
            Update this objective&apos;s details.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="edit-obj-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="edit-obj-title"
              name="title"
              defaultValue={objective.title}
              required
              disabled={isPending}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="edit-obj-desc" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="edit-obj-desc"
              name="description"
              defaultValue={objective.description ?? ""}
              disabled={isPending}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="edit-obj-tf" className="text-sm font-medium">
              Time Frame
            </label>
            <Select name="timeFrame" defaultValue={objective.timeFrame}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {quarters.map((q) => (
                  <SelectItem key={q} value={q}>
                    {q}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label htmlFor="edit-obj-status" className="text-sm font-medium">
              Status
            </label>
            <Select name="status" defaultValue={objective.status}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function UpdateProgressDialog({
  keyResult,
  onSuccess,
}: {
  keyResult: { id: string; title: string; currentValue: number; targetValue: number; unit: string }
  onSuccess: () => void
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("id", keyResult.id)
    startTransition(async () => {
      const result = await updateOkrKeyResult(formData)
      if (result.success) {
        setOpen(false)
        onSuccess()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs">
          Update
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Progress</DialogTitle>
          <DialogDescription>
            Update the current value for &quot;{keyResult.title}&quot;.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="kr-progress" className="text-sm font-medium">
              Current Value ({keyResult.unit})
            </label>
            <Input
              id="kr-progress"
              name="currentValue"
              type="number"
              min={0}
              defaultValue={keyResult.currentValue}
              required
              disabled={isPending}
            />
            <p className="text-muted-foreground text-xs">
              Target: {keyResult.targetValue} {keyResult.unit}
            </p>
          </div>
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Saving..." : "Update Progress"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function OkrSettings({ objectives, userRole }: OkrSettingsProps) {
  const [isPending, startTransition] = useTransition()
  const canEdit = userRole === "ADMIN" || userRole === "REVIEWER"

  function handleDeleteObjective(id: string) {
    if (!confirm("Delete this objective and all its key results?")) return
    startTransition(async () => {
      await deleteOkrObjective(id)
    })
  }

  function handleDeleteKeyResult(id: string) {
    if (!confirm("Delete this key result?")) return
    startTransition(async () => {
      await deleteOkrKeyResult(id)
    })
  }

  // no-op for revalidation callbacks since server actions already call revalidatePath
  function noop() {}

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Objectives & Key Results</CardTitle>
            <CardDescription>
              {objectives.length} objective{objectives.length !== 1 ? "s" : ""} defined.
              Track progress against your organization&apos;s goals.
            </CardDescription>
          </div>
          {canEdit && <AddObjectiveDialog onSuccess={noop} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {objectives.length === 0 && (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No objectives yet. Add one to get started.
          </p>
        )}
        {objectives.map((obj) => {
          const style = STATUS_STYLES[obj.status] ?? { variant: "outline" as const, className: "" }
          return (
            <div key={obj.id} className="rounded-md border p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-semibold">{obj.title}</h4>
                    <Badge variant="outline" className="text-xs">
                      {obj.timeFrame}
                    </Badge>
                    <Badge variant={style.variant} className={style.className}>
                      {obj.status}
                    </Badge>
                  </div>
                  {obj.description && (
                    <p className="text-muted-foreground mt-1 text-sm">
                      {obj.description}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <EditObjectiveDialog objective={obj} onSuccess={noop} />
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleDeleteObjective(obj.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>

              {obj.keyResults.length > 0 && (
                <div className="space-y-2 pl-2">
                  {obj.keyResults.map((kr) => {
                    const pct = kr.targetValue > 0
                      ? Math.min(100, Math.round((kr.currentValue / kr.targetValue) * 100))
                      : 0
                    return (
                      <div key={kr.id} className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm truncate">{kr.title}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-muted-foreground text-xs">
                              {kr.currentValue} / {kr.targetValue} {kr.unit}
                            </span>
                            {canEdit && (
                              <>
                                <UpdateProgressDialog keyResult={kr} onSuccess={noop} />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-destructive hover:text-destructive"
                                  disabled={isPending}
                                  onClick={() => handleDeleteKeyResult(kr.id)}
                                >
                                  Remove
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                      </div>
                    )
                  })}
                </div>
              )}

              {canEdit && (
                <AddKeyResultDialog objectiveId={obj.id} onSuccess={noop} />
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
