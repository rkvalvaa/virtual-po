import { z } from 'zod';
import { documentCitationSchema } from '@/lib/documents/citations';

const storedCitations = z.array(documentCitationSchema.extend({ filename: z.string(), contentHash: z.string() })).max(20);
export function DocumentCitations({ value, attachmentIds, omissions }: { value: unknown; attachmentIds: string[]; omissions?: unknown }) {
  const parsed = storedCitations.safeParse(value);
  const omitted = z.array(z.object({ attachmentId: z.string(), reason: z.string() })).safeParse(omissions);
  if ((!parsed.success || !parsed.data.length) && (!omitted.success || !omitted.data.length)) return null;
  return <section aria-label="Supporting document citations" className="space-y-3 rounded-lg border p-4">
    <h3 className="font-semibold">Supporting documents</h3>
    {parsed.success && parsed.data.map((citation, index) => <div key={`${citation.attachmentId}-${index}`} className="space-y-1 text-sm">
      <p>{citation.claim}</p>
      {attachmentIds.includes(citation.attachmentId)
        ? <a className="break-words underline" href={`/api/attachments/${citation.attachmentId}`} target="_blank" rel="noreferrer">{citation.filename} · lines {citation.startLine}–{citation.endLine}</a>
        : <p className="text-muted-foreground">Source removed: {citation.filename}. The assessment conclusion is retained.</p>}
    </div>)}
    {omitted.success && omitted.data.map(item => <p className="text-sm text-muted-foreground" key={item.attachmentId}>Document omitted: {item.reason}.</p>)}
  </section>;
}
