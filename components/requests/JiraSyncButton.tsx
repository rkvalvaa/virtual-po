"use client"
import { TrackerExport } from './TrackerExport'
import type { ExportResult } from '@/lib/export/durable'
export function JiraSyncButton(props: { requestId: string; jiraEpicKey: string | null; jiraEpicUrl: string | null; hasJiraIntegration: boolean; initial?: ExportResult; canExport?: boolean }) {
  return props.hasJiraIntegration ? <TrackerExport requestId={props.requestId} provider="JIRA" url={props.jiraEpicUrl} initial={props.initial} canExport={props.canExport} /> : null
}
