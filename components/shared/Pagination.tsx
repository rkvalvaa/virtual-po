"use client"

import { useCallback } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface PaginationProps {
  /** Total number of rows across all pages. */
  total: number
  /** Page size. */
  limit: number
  /** Zero-indexed offset of the first row currently displayed. */
  offset: number
}

/**
 * URL-driven pagination control. Reads `offset` from the current URL and
 * writes a new value via router.push, keeping any other query params intact.
 * Renders nothing when there's only one page worth of rows.
 */
export function Pagination({ total, limit, offset }: PaginationProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const goTo = useCallback(
    (nextOffset: number) => {
      const params = new URLSearchParams(searchParams.toString())
      if (nextOffset <= 0) {
        params.delete("offset")
      } else {
        params.set("offset", String(nextOffset))
      }
      const qs = params.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    },
    [router, pathname, searchParams],
  )

  if (total <= limit) return null

  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.ceil(total / limit)
  const firstRow = offset + 1
  const lastRow = Math.min(offset + limit, total)
  const hasPrev = offset > 0
  const hasNext = offset + limit < total

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="text-muted-foreground">
        Showing <span className="text-foreground font-medium">{firstRow}</span>
        –<span className="text-foreground font-medium">{lastRow}</span> of{" "}
        <span className="text-foreground font-medium">{total}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground hidden text-xs sm:inline">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasPrev}
          onClick={() => goTo(Math.max(0, offset - limit))}
          aria-label="Previous page"
        >
          <ChevronLeft className="mr-1 h-3 w-3" />
          Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasNext}
          onClick={() => goTo(offset + limit)}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="ml-1 h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}
