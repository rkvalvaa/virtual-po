import { Suspense } from "react"
import Link from "next/link"
import { requireAuth } from "@/lib/auth/session"
import { searchFeatureRequests } from "@/lib/db/queries/feature-requests"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { BulkRequestTable } from "@/components/requests/BulkRequestTable"
import { SearchFilterBar } from "@/components/requests/SearchFilterBar"
import { Pagination } from "@/components/shared/Pagination"
import { getVoteSummariesByRequestIds } from "@/lib/db/queries/votes"
import { Plus } from "lucide-react"
import { ExportButton } from "@/components/shared/ExportButton"
import type { RequestStatus, Complexity } from "@/lib/types/database"
import type { SearchFilters } from "@/lib/db/queries/feature-requests"
import { assessmentScoringPolicy } from '@/config/scoring-policy'
import { getWorkspaceCapabilities, getWorkspaceSetup } from '@/lib/db/queries/setup'
import { SetupChecklist } from '@/components/setup/SetupChecklist'

interface RequestsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function parseSearchParams(
  params: Record<string, string | string[] | undefined>
): SearchFilters {
  const filters: SearchFilters = {}
  filters.archived = params.archived === 'true'

  const search = typeof params.search === "string" ? params.search : undefined
  if (search) filters.search = search

  const statuses = toArray(params.status) as RequestStatus[]
  if (statuses.length > 0) filters.statuses = statuses

  const complexities = toArray(params.complexity) as Complexity[]
  if (complexities.length > 0) filters.complexities = complexities

  const tags = toArray(params.tag)
  if (tags.length > 0) filters.tags = tags

  if (typeof params.dateFrom === "string" && params.dateFrom) {
    filters.dateFrom = params.dateFrom
  }
  if (typeof params.dateTo === "string" && params.dateTo) {
    filters.dateTo = params.dateTo
  }

  if (typeof params.priorityMin === "string" && params.priorityMin) {
    filters.priorityMin = parseFloat(params.priorityMin)
  }
  if (typeof params.priorityMax === "string" && params.priorityMax) {
    filters.priorityMax = parseFloat(params.priorityMax)
  }

  if (typeof params.sortBy === "string" && params.sortBy) {
    const validSorts = [
      "created_at",
      "priority_score",
      "quality_score",
      "updated_at",
    ] as const
    if (validSorts.includes(params.sortBy as (typeof validSorts)[number])) {
      filters.sortBy = params.sortBy as SearchFilters["sortBy"]
    }
  }

  if (typeof params.sortOrder === "string") {
    if (params.sortOrder === "asc" || params.sortOrder === "desc") {
      filters.sortOrder = params.sortOrder
    }
  }

  if (typeof params.offset === "string" && params.offset) {
    filters.offset = parseInt(params.offset, 10)
  }

  return filters
}

export default async function RequestsPage({
  searchParams,
}: RequestsPageProps) {
  const session = await requireAuth()
  const orgId = session.user.orgId

  if (!orgId) {
    return (
      <div className="text-muted-foreground py-12 text-center text-sm">
        No organization found. Please contact an administrator.
      </div>
    )
  }

  const params = await searchParams
  const filters = parseSearchParams(params)
  const PAGE_SIZE = 25
  filters.limit = PAGE_SIZE
  const [{ requests, total }, setup, capabilities] = await Promise.all([
    searchFeatureRequests(orgId, filters),
    getWorkspaceSetup(orgId, session.user.id),
    getWorkspaceCapabilities(orgId, session.user.id),
  ])
  const currentOffset = filters.offset ?? 0
  const voteSummaries =
    requests.length > 0
      ? await getVoteSummariesByRequestIds(requests.map((r) => r.id))
      : []

  const hasFilters =
    filters.search ||
    filters.statuses ||
    filters.complexities ||
    filters.tags ||
    filters.dateFrom ||
    filters.dateTo

  return (
    <div className="space-y-6">
      {setup && <SetupChecklist setup={setup} capabilities={capabilities} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {filters.archived ? 'Archived Requests' : 'Feature Requests'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {total} request{total !== 1 ? "s" : ""}{" "}
            {hasFilters ? "matching filters" : "total"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline"><Link href={filters.archived ? '/requests' : '/requests?archived=true'}>{filters.archived ? 'Active requests' : 'Archived requests'}</Link></Button>
          <ExportButton
            exportUrl={filters.archived ? '/api/export/requests?archived=true' : '/api/export/requests'}
            filename="requests.csv"
          />
          <Button asChild>
            <Link href="/requests/new">
              <Plus />
              New Request
            </Link>
          </Button>
        </div>
      </div>

      <Suspense>
        <SearchFilterBar />
      </Suspense>

      {requests.length === 0 ? (
        <Card>
          <CardHeader className="items-center text-center">
            <CardTitle>
              {filters.archived ? 'No archived requests' : hasFilters ? "No matching requests" : "No requests yet"}
            </CardTitle>
            <CardDescription>
              {filters.archived ? 'Archived requests retain their history and can be restored here.' : hasFilters
                ? "Try adjusting your search or filters to find what you're looking for."
                : "Create your first feature request to get started with the intake process."}
            </CardDescription>
          </CardHeader>
          {!hasFilters && !filters.archived && (
            <CardContent className="flex justify-center">
              <Button asChild>
                <Link href="/requests/new">
                  <Plus />
                  New Request
                </Link>
              </Button>
            </CardContent>
          )}
        </Card>
      ) : (
        <>
          <BulkRequestTable
            archiveMode={filters.archived ? 'restore' : 'archive'}
            requests={requests.map((r) => ({
              id: r.id,
              title: r.title,
              status: r.status,
              priorityScore: r.priorityScore,
              scoringConfig: assessmentScoringPolicy(r.assessmentData).config,
              qualityScore: r.qualityScore,
              complexity: r.complexity,
              tags: r.tags,
              createdAt: r.createdAt.toISOString(),
            }))}
            voteSummaries={voteSummaries.map((v) => ({
              requestId: v.requestId,
              averageScore: v.averageScore,
              voteCount: v.voteCount,
            }))}
            columns={["quality"]}
            statusActions={filters.archived ? [] : [
              { label: "Move to Backlog", targetStatus: "IN_BACKLOG" },
            ]}
          />
          <Suspense>
            <Pagination total={total} limit={PAGE_SIZE} offset={currentOffset} />
          </Suspense>
        </>
      )}
    </div>
  )
}
