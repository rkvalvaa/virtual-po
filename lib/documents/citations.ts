import { z } from 'zod';
import type { DocumentSource } from './context';

export const documentCitationSchema = z.object({
  attachmentId: z.uuid(), startLine: z.number().int().min(1), endLine: z.number().int().min(1),
  claim: z.string().trim().min(1).max(2000),
});
export interface DocumentCitation extends z.infer<typeof documentCitationSchema> { filename: string; contentHash: string }

export function validateDocumentCitations(input: unknown, provided: DocumentSource[], current: DocumentSource[]): DocumentCitation[] {
  const citations = z.array(documentCitationSchema).max(20).parse(input);
  return citations.map(citation => {
    const source = provided.find(item => item.attachmentId === citation.attachmentId);
    const stillSelected = current.find(item => item.attachmentId === citation.attachmentId);
    if (!source || !stillSelected || source.contentHash !== stillSelected.contentHash) {
      throw new Error('Citation source was not read, was removed, or changed. Refresh supporting documents.');
    }
    if (citation.endLine < citation.startLine || citation.endLine > source.lineCount) throw new Error('Citation line range is outside the provided source.');
    return { ...citation, filename: source.filename, contentHash: source.contentHash };
  });
}
