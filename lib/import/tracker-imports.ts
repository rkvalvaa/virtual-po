export const TRACKER_PROVIDERS = ['LINEAR', 'JIRA', 'GITHUB_ISSUES'] as const
export type TrackerProvider = (typeof TRACKER_PROVIDERS)[number]

export const TRACKER_IMPORT_FIELDS = ['title', 'description', 'sourceUrl', 'labels'] as const
export type TrackerImportField = (typeof TRACKER_IMPORT_FIELDS)[number]

export interface TrackerRemoteStatus {
  id?: string | null
  name: string
}

export interface TrackerImportItem {
  provider: TrackerProvider
  destination: string
  remoteEntityId: string
  displayId?: string
  title: string
  description: string | null
  sourceUrl: string
  labels: string[]
  remoteStatus: TrackerRemoteStatus | null
}

export interface TrackerImportSnapshot {
  title: string
  description: string | null
  sourceUrl: string
  labels: string[]
  remoteStatus: TrackerRemoteStatus | null
}

export type TrackerConflictResolution = 'LOCAL' | 'REMOTE'

export interface TrackerImportConflict {
  field: TrackerImportField
  localValue: string | string[] | null
  remoteValue: string | string[] | null
}

export interface TrackerImportItemResult {
  remoteEntityId: string
  displayId?: string
  outcome: 'created' | 'updated' | 'skipped' | 'failed'
  requestId?: string
  linkId?: string
  conflicts: TrackerImportConflict[]
  error?: string
}

export interface TrackerImportResult {
  created: number
  updated: number
  skipped: number
  failed: number
  items: TrackerImportItemResult[]
}

export function normalizeTrackerImportItem(item: TrackerImportItem): TrackerImportItem & TrackerImportSnapshot {
  const destination = item.destination.trim()
  const remoteEntityId = item.remoteEntityId.trim()
  const title = item.title.trim()
  const sourceUrl = item.sourceUrl.trim()
  if (!TRACKER_PROVIDERS.includes(item.provider)) throw new Error('Unsupported tracker provider.')
  if (!destination) throw new Error('Tracker destination is required.')
  if (!remoteEntityId) throw new Error('Remote entity ID is required.')
  if (!title) throw new Error('Request title is required.')
  if (!sourceUrl) throw new Error('Source URL is required.')
  return {
    ...item,
    destination,
    remoteEntityId,
    title,
    description: item.description?.trim() || null,
    sourceUrl,
    labels: [...new Set(item.labels.map(label => label.trim()).filter(Boolean))].sort(),
    remoteStatus: item.remoteStatus
      ? { id: item.remoteStatus.id?.trim() || null, name: item.remoteStatus.name.trim() }
      : null,
  }
}

export function snapshotFromItem(item: TrackerImportItem): TrackerImportSnapshot {
  const normalized = normalizeTrackerImportItem(item)
  return {
    title: normalized.title,
    description: normalized.description,
    sourceUrl: normalized.sourceUrl,
    labels: normalized.labels,
    remoteStatus: normalized.remoteStatus,
  }
}

export function trackerValueEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
