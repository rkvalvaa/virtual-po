export const DOCUMENT_LIMITS = { files: 5, fileBytes: 256 * 1024, textBytes: 16 * 1024, contextBytes: 48 * 1024 } as const;
export function supportsDocumentContext(mimeType: string): boolean {
  return ['text/plain', 'text/markdown'].includes(mimeType.toLowerCase().split(';')[0].trim());
}
