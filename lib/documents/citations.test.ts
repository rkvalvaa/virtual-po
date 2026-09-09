import { describe, expect, it } from 'vitest';
import { validateDocumentCitations } from './citations';
const source = { attachmentId: '00000000-0000-4000-8000-000000000001', filename: 'source.md', text: 'First\nSecond', lineCount: 2, contentHash: 'abc', truncated: false };
const citation = { attachmentId: source.attachmentId, startLine: 1, endLine: 2, claim: 'Evidence supports this conclusion.' };
describe('document citations', () => {
  it('stores source metadata and claim without copying extracted text', () => {
    const result = validateDocumentCitations([citation], [source], [source]);
    expect(result).toEqual([{ ...citation, filename: 'source.md', contentHash: 'abc' }]);
    expect(result[0]).not.toHaveProperty('text');
  });
  it('rejects invented sources, unread sources, deleted sources and out-of-range lines', () => {
    expect(() => validateDocumentCitations([citation], [], [source])).toThrow();
    expect(() => validateDocumentCitations([citation], [source], [])).toThrow();
    expect(() => validateDocumentCitations([{ ...citation, endLine: 3 }], [source], [source])).toThrow();
    expect(() => validateDocumentCitations([citation], [source], [{ ...source, contentHash: 'changed' }])).toThrow();
  });
});
