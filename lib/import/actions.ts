import { requireAuth } from '@/lib/auth/session'
import { canAccess } from '@/lib/auth/rbac'
import { getIntegrationByType } from '@/lib/db/queries/jira-sync'
import {
  getTrackerImportLinkById,
  importTrackerItems,
  resolveTrackerImportConflict,
  type TrackerImportContext,
} from '@/lib/db/queries/tracker-imports'
import type { Integration } from '@/lib/types/database'
import type {
  TrackerConflictResolution,
  TrackerImportField,
  TrackerImportResult,
  TrackerProvider,
} from './tracker-imports'
import type { TrackerPreviewPage } from './provider-pages'

export type TrackerImportAccess =
  | { success: true; context: TrackerImportContext; integration: Integration }
  | { success: false; error: string }

export async function requireTrackerImportAccess(provider: TrackerProvider): Promise<TrackerImportAccess> {
  const session = await requireAuth()
  if (!canAccess(session.user.role, 'REVIEWER')) return { success: false, error: 'Insufficient permissions.' }
  const organizationId = session.user.orgId
  if (!organizationId) return { success: false, error: 'No organization found.' }
  const integration = await getIntegrationByType(organizationId, provider)
  if (!integration) return { success: false, error: `No ${provider === 'GITHUB_ISSUES' ? 'GitHub Issues' : provider === 'LINEAR' ? 'Linear' : 'Jira'} integration found.` }
  return { success: true, context: { organizationId, requesterId: session.user.id }, integration }
}

export async function importSelectedPreview(
  context: TrackerImportContext,
  page: TrackerPreviewPage,
  remoteEntityIds: string[],
): Promise<{ success: true; result: TrackerImportResult } | { success: false; error: string }> {
  const requested = new Set(remoteEntityIds)
  const selected = page.items.filter(item => requested.has(item.remoteEntityId))
  if (requested.size === 0 || selected.length !== requested.size) {
    return { success: false, error: 'The preview changed. Preview this page again before importing.' }
  }
  return { success: true, result: await importTrackerItems(context, selected) }
}

export async function resolveImportConflictForProvider(
  provider: TrackerProvider,
  linkId: string,
  resolutions: Partial<Record<TrackerImportField, TrackerConflictResolution>>,
) {
  const access = await requireTrackerImportAccess(provider)
  if (!access.success) return access
  const link = await getTrackerImportLinkById(access.context.organizationId, linkId)
  if (!link || link.provider !== provider) return { success: false as const, error: 'Import conflict not found.' }
  return { success: true as const, item: await resolveTrackerImportConflict(access.context, linkId, resolutions) }
}

export function trackerActionError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
