"use client"

import { useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  uploadAttachments,
  removeAttachment,
} from "@/app/(dashboard)/requests/[id]/attachment-actions"
import {
  ALLOWED_MIME_TYPES,
  IMAGE_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  formatBytes,
  validateAttachment,
} from "@/lib/storage/validate"
import { Download, Paperclip, Trash2, Upload } from "lucide-react"

export interface AttachmentView {
  id: string
  filename: string
  mimeType: string
  size: number
  uploaderName: string | null
  createdAt: string
  canDelete: boolean
}

export interface AttachmentsCardProps {
  requestId: string
  attachments: AttachmentView[]
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function AttachmentsCard({ requestId, attachments }: AttachmentsCardProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function upload(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return

    // Mirror of the server check — cheap rejection before a 10 MB round trip.
    const localErrors = list
      .map((file) =>
        validateAttachment({ name: file.name, type: file.type, size: file.size })
      )
      .flatMap((result) => (result.ok ? [] : [result.error]))
    if (localErrors.length > 0) {
      setErrors(localErrors)
      return
    }

    const formData = new FormData()
    for (const file of list) formData.append("files", file)

    setPending(true)
    setErrors([])
    try {
      const result = await uploadAttachments(requestId, formData)
      if (!result.success) setErrors(result.errors)
    } catch (err: unknown) {
      setErrors([err instanceof Error ? err.message : "Upload failed"])
    } finally {
      setPending(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function handleDelete(id: string, filename: string) {
    if (!window.confirm(`Delete "${filename}"? This cannot be undone.`)) return
    setDeletingId(id)
    setErrors([])
    try {
      await removeAttachment(id)
    } catch (err: unknown) {
      setErrors([err instanceof Error ? err.message : "Delete failed"])
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="h-4 w-4" />
          Attachments
          {attachments.length > 0 && (
            <span className="text-muted-foreground text-sm font-normal">
              ({attachments.length})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void upload(e.dataTransfer.files)
          }}
          className={`rounded-md border border-dashed p-6 text-center transition-colors ${
            dragging ? "border-primary bg-accent" : "border-input"
          }`}
        >
          <Upload className="text-muted-foreground mx-auto mb-2 h-5 w-5" />
          <p className="text-muted-foreground text-sm">
            Drag files here, or{" "}
            <button
              type="button"
              className="text-primary underline underline-offset-2 disabled:opacity-50"
              onClick={() => inputRef.current?.click()}
              disabled={pending}
            >
              browse
            </button>
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Images, PDF, text, CSV, Markdown, Word, Excel — up to{" "}
            {formatBytes(MAX_ATTACHMENT_BYTES)} each
          </p>
          {pending && (
            <p className="text-muted-foreground mt-2 text-sm">Uploading...</p>
          )}
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept={ALLOWED_MIME_TYPES.join(",")}
            onChange={(e) => {
              if (e.target.files) void upload(e.target.files)
            }}
          />
        </div>

        {errors.length > 0 && (
          <ul className="text-destructive space-y-1 text-sm">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}

        {attachments.length === 0 ? (
          <p className="text-muted-foreground text-sm">No attachments yet.</p>
        ) : (
          <ul className="divide-y">
            {attachments.map((attachment) => {
              const href = `/api/attachments/${attachment.id}`
              const isImage = IMAGE_MIME_TYPES.includes(attachment.mimeType)
              return (
                <li key={attachment.id} className="flex items-center gap-3 py-3">
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={href}
                      alt={attachment.filename}
                      loading="lazy"
                      className="bg-muted h-12 w-12 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="bg-muted flex h-12 w-12 shrink-0 items-center justify-center rounded">
                      <Paperclip className="text-muted-foreground h-4 w-4" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {attachment.filename}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatBytes(attachment.size)} &middot;{" "}
                      {attachment.uploaderName ?? "Unknown"} &middot;{" "}
                      {formatDate(attachment.createdAt)}
                    </p>
                  </div>

                  <Button variant="ghost" size="sm" asChild>
                    <a href={href} download={attachment.filename}>
                      <Download className="h-4 w-4" />
                      <span className="sr-only">Download {attachment.filename}</span>
                    </a>
                  </Button>

                  {attachment.canDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deletingId === attachment.id}
                      onClick={() => handleDelete(attachment.id, attachment.filename)}
                    >
                      <Trash2 className="text-destructive h-4 w-4" />
                      <span className="sr-only">Delete {attachment.filename}</span>
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
