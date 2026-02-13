'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const PRESETS = [
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 90 days', value: '90d' },
  { label: 'All time', value: 'all' },
] as const

function getPresetDates(preset: string): { from: string; to: string } | null {
  const to = new Date().toISOString().split('T')[0]
  const fromDate = new Date()

  switch (preset) {
    case '7d':
      fromDate.setDate(fromDate.getDate() - 7)
      return { from: fromDate.toISOString().split('T')[0], to }
    case '30d':
      fromDate.setDate(fromDate.getDate() - 30)
      return { from: fromDate.toISOString().split('T')[0], to }
    case '90d':
      fromDate.setDate(fromDate.getDate() - 90)
      return { from: fromDate.toISOString().split('T')[0], to }
    default:
      return null
  }
}

export function DateRangeFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const activePreset = searchParams.get('preset') || 'all'
  const fromValue = searchParams.get('from') || ''
  const toValue = searchParams.get('to') || ''

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      }
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  const handlePreset = (preset: string) => {
    if (preset === 'all') {
      updateParams({ preset: null, from: null, to: null })
    } else {
      const dates = getPresetDates(preset)
      if (dates) {
        updateParams({ preset, from: dates.from, to: dates.to })
      }
    }
  }

  const handleCustomFrom = (value: string) => {
    updateParams({ preset: 'custom', from: value || null, to: toValue || null })
  }

  const handleCustomTo = (value: string) => {
    updateParams({ preset: 'custom', from: fromValue || null, to: value || null })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((preset) => (
        <Button
          key={preset.value}
          variant={activePreset === preset.value ? 'default' : 'outline'}
          size="sm"
          onClick={() => handlePreset(preset.value)}
        >
          {preset.label}
        </Button>
      ))}
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={activePreset === 'custom' ? fromValue : ''}
          onChange={(e) => handleCustomFrom(e.target.value)}
          className="h-8 w-36 text-sm"
          aria-label="From date"
        />
        <span className="text-muted-foreground text-sm">to</span>
        <Input
          type="date"
          value={activePreset === 'custom' ? toValue : ''}
          onChange={(e) => handleCustomTo(e.target.value)}
          className="h-8 w-36 text-sm"
          aria-label="To date"
        />
      </div>
    </div>
  )
}
