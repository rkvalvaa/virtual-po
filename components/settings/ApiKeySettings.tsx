"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  createApiKeyAction,
  revokeApiKeyAction,
} from "@/app/(dashboard)/settings/api-actions"

export interface ApiKeySettingsProps {
  apiKeys: Array<{
    id: string
    name: string
    keyPrefix: string
    scopes: string[]
    lastUsedAt: string | null
    expiresAt: string | null
    isActive: boolean
    createdAt: string
  }>
  userRole: string
}

const SCOPE_OPTIONS = [
  { value: "read", label: "Read", description: "List and view requests" },
  { value: "write", label: "Write", description: "Create and update requests" },
  { value: "admin", label: "Admin", description: "Full access including key management" },
] as const

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function ApiKeySettings({ apiKeys, userRole }: ApiKeySettingsProps) {
  const [isPending, startTransition] = useTransition()
  const [createOpen, setCreateOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(["read"])
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const isAdmin = userRole === "ADMIN"
  const activeKeys = apiKeys.filter((k) => k.isActive)
  const revokedKeys = apiKeys.filter((k) => !k.isActive)

  function handleScopeToggle(scope: string, checked: boolean) {
    setNewKeyScopes((prev) =>
      checked ? [...prev, scope] : prev.filter((s) => s !== scope)
    )
  }

  function handleCreate() {
    if (!newKeyName.trim() || newKeyScopes.length === 0) return
    startTransition(async () => {
      const result = await createApiKeyAction(newKeyName.trim(), newKeyScopes)
      if (result.success && result.key) {
        setCreatedKey(result.key)
        setMessage({ type: "success", text: "API key created." })
      } else {
        setMessage({ type: "error", text: result.error ?? "Failed to create." })
      }
    })
  }

  function handleRevoke(id: string) {
    startTransition(async () => {
      const result = await revokeApiKeyAction(id)
      if (result.success) {
        setMessage({ type: "success", text: "API key revoked." })
      } else {
        setMessage({ type: "error", text: result.error ?? "Failed to revoke." })
      }
    })
  }

  function handleCopy() {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function handleCloseCreate() {
    setCreateOpen(false)
    setNewKeyName("")
    setNewKeyScopes(["read"])
    setCreatedKey(null)
    setCopied(false)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>API Keys</CardTitle>
            <CardDescription>
              Manage API keys for programmatic access to the public API.
            </CardDescription>
          </div>
          {isAdmin && (
            <Dialog open={createOpen} onOpenChange={(open) => {
              if (!open) handleCloseCreate()
              else setCreateOpen(true)
            }}>
              <DialogTrigger asChild>
                <Button>Create API Key</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {createdKey ? "API Key Created" : "Create API Key"}
                  </DialogTitle>
                  {!createdKey && (
                    <DialogDescription>
                      Give the key a name and select the permissions it should have.
                    </DialogDescription>
                  )}
                </DialogHeader>

                {createdKey ? (
                  <div className="space-y-4">
                    <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3">
                      <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                        Copy this key now. It will not be shown again.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="bg-muted flex-1 rounded-md p-2 text-sm break-all">
                        {createdKey}
                      </code>
                      <Button variant="outline" size="sm" onClick={handleCopy}>
                        {copied ? "Copied!" : "Copy"}
                      </Button>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleCloseCreate}>Done</Button>
                    </DialogFooter>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="key-name">Name</Label>
                      <Input
                        id="key-name"
                        placeholder="e.g. CI/CD Pipeline"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Scopes</Label>
                      {SCOPE_OPTIONS.map((opt) => (
                        <div key={opt.value} className="flex items-center gap-2">
                          <Checkbox
                            id={`scope-${opt.value}`}
                            checked={newKeyScopes.includes(opt.value)}
                            onCheckedChange={(checked) =>
                              handleScopeToggle(opt.value, !!checked)
                            }
                          />
                          <Label htmlFor={`scope-${opt.value}`} className="flex items-center gap-2 font-normal">
                            <span className="font-medium">{opt.label}</span>
                            <span className="text-muted-foreground text-xs">
                              {opt.description}
                            </span>
                          </Label>
                        </div>
                      ))}
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={handleCreate}
                        disabled={isPending || !newKeyName.trim() || newKeyScopes.length === 0}
                      >
                        {isPending ? "Creating..." : "Create Key"}
                      </Button>
                    </DialogFooter>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>

      {message && (
        <div className="px-6 pb-2">
          <p className={`text-sm ${message.type === "error" ? "text-red-600" : "text-green-600"}`}>
            {message.text}
          </p>
        </div>
      )}

      <CardContent className="p-0">
        {activeKeys.length === 0 && revokedKeys.length === 0 ? (
          <div className="text-muted-foreground px-6 py-8 text-center text-sm">
            No API keys created yet. Create one to access the public API.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeKeys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.name}</TableCell>
                  <TableCell>
                    <code className="text-muted-foreground text-xs">
                      {key.keyPrefix}...
                    </code>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {key.scopes.map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(key.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {key.lastUsedAt ? formatDate(key.lastUsedAt) : "Never"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="default" className="text-xs">Active</Badge>
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleRevoke(key.id)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {revokedKeys.map((key) => (
                <TableRow key={key.id} className="opacity-50">
                  <TableCell className="font-medium">{key.name}</TableCell>
                  <TableCell>
                    <code className="text-muted-foreground text-xs">
                      {key.keyPrefix}...
                    </code>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {key.scopes.map((s) => (
                        <Badge key={s} variant="outline" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(key.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {key.lastUsedAt ? formatDate(key.lastUsedAt) : "Never"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">Revoked</Badge>
                  </TableCell>
                  {isAdmin && <TableCell />}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
