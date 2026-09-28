import { del, list } from '@vercel/blob';
import { query } from '@/lib/db/pool';

/** Where attachment uploads land: in-app (`orgs/…`) and portal staging (`portal/…`). */
const SWEPT_PREFIXES = ['orgs/', 'portal/'];
const GRACE_MS = 24 * 3600_000;

export interface SweepResult { checked: number; deleted: number; complete: boolean }

/**
 * Delete stored files that no attachment row points at: a direct upload whose
 * browser closed before the row was written, or portal files never submitted.
 * Anything younger than a day is left alone, since its row may still be coming.
 *
 * Only run this against the database that owns the store. Every environment
 * shares one store, so a sweep from another database sees production's files
 * as unrecorded.
 */
export async function sweepOrphanBlobs(options: { now?: Date; prefixes?: string[]; maxChecked?: number } = {}): Promise<SweepResult> {
  const { now = new Date(), prefixes = SWEPT_PREFIXES, maxChecked = 10_000 } = options;
  if (prefixes.some(prefix => !SWEPT_PREFIXES.some(root => prefix.startsWith(root)))) {
    throw new Error('Only orgs/ or portal/ uploads can be swept.');
  }
  const cutoff = now.getTime() - GRACE_MS;
  const result: SweepResult = { checked: 0, deleted: 0, complete: true };

  for (const prefix of prefixes) {
    let cursor: string | undefined;
    do {
      // ponytail: restarts from the top each run, so past `maxChecked` recorded
      // blobs the tail is never reached; persist the cursor if the log shows complete:false.
      if (result.checked >= maxChecked) return { ...result, complete: false };
      const page = await list({ prefix, cursor, limit: Math.min(1000, maxChecked - result.checked) });
      result.checked += page.blobs.length;
      const old = page.blobs.filter(blob => blob.pathname.startsWith(prefix) && blob.uploadedAt.getTime() < cutoff);
      const orphans = await unrecorded(old.map(blob => blob.pathname));
      if (orphans.size) await del(old.filter(blob => orphans.has(blob.pathname)).map(blob => blob.url));
      result.deleted += orphans.size;
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  }
  return result;
}

async function unrecorded(pathnames: string[]): Promise<Set<string>> {
  if (!pathnames.length) return new Set();
  const rows = await query<{ storage_key: string }>('SELECT storage_key FROM attachments WHERE storage_key = ANY($1)', [pathnames]);
  const known = new Set(rows.rows.map(row => row.storage_key));
  return new Set(pathnames.filter(pathname => !known.has(pathname)));
}
