"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Search, Filter, X, ChevronDown } from "lucide-react"
import { REQUEST_STATUSES, COMPLEXITY_VALUES } from "@/lib/types/database"
import type { RequestStatus, Complexity } from "@/lib/types/database"

const STATUS_LABELS: Record<RequestStatus, string> = {
  DRAFT: "Draft",
  INTAKE_IN_PROGRESS: "Intake In Progress",
  PENDING_ASSESSMENT: "Pending Assessment",
  UNDER_REVIEW: "Under Review",
  NEEDS_INFO: "Needs Info",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  DEFERRED: "Deferred",
  IN_BACKLOG: "In Backlog",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
}

const COMPLEXITY_LABELS: Record<Complexity, string> = {
  XS: "XS",
  S: "Small",
  M: "Medium",
  L: "Large",
  XL: "XL",
  UNKNOWN: "Unknown",
}

export function SearchFilterBar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [searchValue, setSearchValue] = useState(
    searchParams.get("search") ?? ""
  )
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedStatuses = searchParams.getAll("status") as RequestStatus[]
  const selectedComplexities = searchParams.getAll(
    "complexity"
  ) as Complexity[]
  const dateFrom = searchParams.get("dateFrom") ?? ""
  const dateTo = searchParams.get("dateTo") ?? ""
  const sortBy = searchParams.get("sortBy") ?? "created_at"
  const sortOrder = searchParams.get("sortOrder") ?? "desc"

  const activeFilterCount =
    selectedStatuses.length +
    selectedComplexities.length +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0)

  const updateParams = useCallback(
    (updates: Record<string, string | string[] | null>) => {
      const params = new URLSearchParams(searchParams.toString())

      for (const [key, value] of Object.entries(updates)) {
        params.delete(key)
        if (value === null) continue
        if (Array.isArray(value)) {
          for (const v of value) {
            params.append(key, v)
          }
        } else if (value) {
          params.set(key, value)
        }
      }

      // Reset to page 1 when filters change
      params.delete("offset")

      const qs = params.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    },
    [router, pathname, searchParams]
  )

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      const currentSearch = searchParams.get("search") ?? ""
      if (searchValue !== currentSearch) {
        updateParams({ search: searchValue || null })
      }
    }, 300)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [searchValue, searchParams, updateParams])

  function toggleStatus(status: RequestStatus) {
    const next = selectedStatuses.includes(status)
      ? selectedStatuses.filter((s) => s !== status)
      : [...selectedStatuses, status]
    updateParams({ status: next.length > 0 ? next : null })
  }

  function toggleComplexity(complexity: Complexity) {
    const next = selectedComplexities.includes(complexity)
      ? selectedComplexities.filter((c) => c !== complexity)
      : [...selectedComplexities, complexity]
    updateParams({ complexity: next.length > 0 ? next : null })
  }

  function clearAllFilters() {
    setSearchValue("")
    router.push(pathname)
  }

  function handleSortChange(field: string) {
    if (sortBy === field) {
      updateParams({ sortOrder: sortOrder === "asc" ? "desc" : "asc" })
    } else {
      updateParams({ sortBy: field, sortOrder: "desc" })
    }
  }

  const hasAnyFilter = searchValue || activeFilterCount > 0

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="text-muted-foreground absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search requests..."
            className="pl-9"
          />
          {searchValue && (
            <button
              onClick={() => setSearchValue("")}
              className="text-muted-foreground hover:text-foreground absolute right-2.5 top-1/2 -translate-y-1/2"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Status filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              Status
              {selectedStatuses.length > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 text-[10px]">
                  {selectedStatuses.length}
                </Badge>
              )}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" align="start">
            <div className="space-y-2">
              <p className="text-sm font-medium">Filter by status</p>
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {REQUEST_STATUSES.map((status) => (
                  <label
                    key={status}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-accent"
                  >
                    <Checkbox
                      checked={selectedStatuses.includes(status)}
                      onCheckedChange={() => toggleStatus(status)}
                    />
                    <span className="text-sm">{STATUS_LABELS[status]}</span>
                  </label>
                ))}
              </div>
              {selectedStatuses.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => updateParams({ status: null })}
                >
                  Clear status filter
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Complexity filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              Complexity
              {selectedComplexities.length > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 text-[10px]">
                  {selectedComplexities.length}
                </Badge>
              )}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-3" align="start">
            <div className="space-y-2">
              <p className="text-sm font-medium">Filter by complexity</p>
              <div className="space-y-1">
                {COMPLEXITY_VALUES.map((c) => (
                  <label
                    key={c}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-accent"
                  >
                    <Checkbox
                      checked={selectedComplexities.includes(c)}
                      onCheckedChange={() => toggleComplexity(c)}
                    />
                    <span className="text-sm">{COMPLEXITY_LABELS[c]}</span>
                  </label>
                ))}
              </div>
              {selectedComplexities.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => updateParams({ complexity: null })}
                >
                  Clear complexity filter
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Date range filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              Date Range
              {(dateFrom || dateTo) && (
                <Badge variant="secondary" className="ml-1 px-1.5 text-[10px]">
                  1
                </Badge>
              )}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <div className="space-y-3">
              <p className="text-sm font-medium">Filter by date</p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">From</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) =>
                      updateParams({ dateFrom: e.target.value || null })
                    }
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">To</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) =>
                      updateParams({ dateTo: e.target.value || null })
                    }
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    updateParams({ dateFrom: null, dateTo: null })
                  }
                >
                  Clear date filter
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Sort dropdown */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              Sort
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <div className="space-y-1">
              {[
                { value: "created_at", label: "Date Created" },
                { value: "updated_at", label: "Last Updated" },
                { value: "priority_score", label: "Priority Score" },
                { value: "quality_score", label: "Quality Score" },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleSortChange(option.value)}
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-accent ${
                    sortBy === option.value ? "bg-accent font-medium" : ""
                  }`}
                >
                  {option.label}
                  {sortBy === option.value && (
                    <span className="text-muted-foreground text-xs">
                      {sortOrder === "asc" ? "asc" : "desc"}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Active filter count + clear */}
        {hasAnyFilter && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Filter className="h-3 w-3" />
              {activeFilterCount + (searchValue ? 1 : 0)} active
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={clearAllFilters}
            >
              <X className="mr-1 h-3 w-3" />
              Clear all
            </Button>
          </div>
        )}
      </div>

      {/* Active filter pills */}
      {(selectedStatuses.length > 0 || selectedComplexities.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {selectedStatuses.map((status) => (
            <Badge
              key={status}
              variant="outline"
              className="cursor-pointer gap-1 pr-1"
              onClick={() => toggleStatus(status)}
            >
              {STATUS_LABELS[status]}
              <X className="h-3 w-3" />
            </Badge>
          ))}
          {selectedComplexities.map((c) => (
            <Badge
              key={c}
              variant="outline"
              className="cursor-pointer gap-1 pr-1"
              onClick={() => toggleComplexity(c)}
            >
              {COMPLEXITY_LABELS[c]}
              <X className="h-3 w-3" />
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
