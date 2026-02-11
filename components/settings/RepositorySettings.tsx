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
import {
  fetchAvailableRepos,
  connectRepo,
  disconnectRepo,
} from "@/app/(dashboard)/settings/actions"
import type { GitHubRepo } from "@/lib/github/client"

interface ConnectedRepo {
  id: string
  fullName: string
  owner: string
  name: string
  defaultBranch: string
  connectedAt: string
}

interface RepositorySettingsProps {
  repositories: ConnectedRepo[]
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function RepositorySettings({
  repositories,
}: RepositorySettingsProps) {
  const [open, setOpen] = useState(false)
  const [availableRepos, setAvailableRepos] = useState<GitHubRepo[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()

  const connectedGithubIds = new Set(
    repositories.map((r) => r.fullName)
  )

  async function handleOpenDialog() {
    setLoading(true)
    setFetchError(null)
    setOpen(true)

    const result = await fetchAvailableRepos()

    if ("error" in result) {
      setFetchError(result.error)
      setAvailableRepos([])
    } else {
      setAvailableRepos(result.repos)
    }

    setLoading(false)
  }

  function handleConnect(repo: GitHubRepo) {
    startTransition(async () => {
      const result = await connectRepo(
        repo.id,
        repo.owner,
        repo.name,
        repo.fullName,
        repo.defaultBranch
      )
      if (result.success) {
        setOpen(false)
      }
    })
  }

  function handleDisconnect(repoId: string) {
    startTransition(async () => {
      await disconnectRepo(repoId)
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Repositories</CardTitle>
            <CardDescription>
              {repositories.length} connected repositor
              {repositories.length !== 1 ? "ies" : "y"}.
              Connect GitHub repositories to enable code-aware assessments.
            </CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleOpenDialog}>
                Connect Repository
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>Connect a Repository</DialogTitle>
                <DialogDescription>
                  Select a GitHub repository to connect to your organization.
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto -mx-6 px-6">
                {loading && (
                  <div className="text-muted-foreground py-8 text-center text-sm">
                    Loading repositories...
                  </div>
                )}
                {fetchError && (
                  <div className="text-destructive py-8 text-center text-sm">
                    {fetchError}
                  </div>
                )}
                {!loading && !fetchError && availableRepos.length === 0 && (
                  <div className="text-muted-foreground py-8 text-center text-sm">
                    No repositories found.
                  </div>
                )}
                {!loading && !fetchError && availableRepos.length > 0 && (
                  <div className="space-y-2">
                    {availableRepos.map((repo) => {
                      const isConnected = connectedGithubIds.has(repo.fullName)
                      return (
                        <div
                          key={repo.id}
                          className="flex items-center justify-between rounded-md border p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {repo.fullName}
                            </p>
                            {repo.description && (
                              <p className="text-muted-foreground truncate text-xs">
                                {repo.description}
                              </p>
                            )}
                            <div className="mt-1 flex items-center gap-2">
                              {repo.language && (
                                <Badge variant="secondary" className="text-xs">
                                  {repo.language}
                                </Badge>
                              )}
                              {repo.isPrivate && (
                                <Badge variant="outline" className="text-xs">
                                  Private
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="ml-3 shrink-0">
                            {isConnected ? (
                              <Badge variant="secondary">Connected</Badge>
                            ) : (
                              <Button
                                size="sm"
                                disabled={isPending}
                                onClick={() => handleConnect(repo)}
                              >
                                Connect
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      {repositories.length > 0 && (
        <CardContent className="space-y-3">
          {repositories.map((repo) => (
            <div
              key={repo.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{repo.fullName}</p>
                <div className="text-muted-foreground mt-0.5 flex items-center gap-3 text-xs">
                  <span>Branch: {repo.defaultBranch}</span>
                  <span>Connected {formatDate(repo.connectedAt)}</span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => handleDisconnect(repo.id)}
                className="ml-3 shrink-0"
              >
                Disconnect
              </Button>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  )
}
