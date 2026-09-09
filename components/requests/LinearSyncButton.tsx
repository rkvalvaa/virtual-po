"use client"
import { TrackerExport } from './TrackerExport'
import type { ExportResult } from '@/lib/export/durable'
export function LinearSyncButton(props: { requestId: string; linearProjectId: string | null; linearProjectUrl: string | null; hasLinearIntegration: boolean; initial?: ExportResult; canExport?: boolean }) {
  return props.hasLinearIntegration ? <TrackerExport requestId={props.requestId} provider="LINEAR" url={props.linearProjectUrl} initial={props.initial} canExport={props.canExport} /> : null
}
