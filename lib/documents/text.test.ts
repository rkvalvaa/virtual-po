// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { extractDocumentText } from './text';

function stream(...chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({ start(controller) { chunks.forEach(chunk => controller.enqueue(chunk)); controller.close(); } });
}
describe('bounded document extraction', () => {
  it('decodes multibyte UTF-8 split across stream chunks and normalizes line endings', async () => {
    const bytes = new TextEncoder().encode('Norsk blå\r\nSecond line');
    expect(await extractDocumentText(stream(bytes.slice(0, 10), bytes.slice(10)))).toMatchObject({ text: 'Norsk blå\nSecond line', truncated: false, lineCount: 2 });
  });
  it('reports truncation rather than silently omitting text from long files', async () => {
    const result = await extractDocumentText(stream(new TextEncoder().encode('a'.repeat(20000))));
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(16 * 1024);
    expect(result.sourceBytes).toBe(20000);
  });
  it('rejects invalid UTF-8 and binary content', async () => {
    await expect(extractDocumentText(stream(new Uint8Array([0xff])))).rejects.toThrow(/UTF-8/);
    await expect(extractDocumentText(stream(new Uint8Array([65, 0, 66])))).rejects.toThrow(/binary/);
  });
  it('cancels a stream that exceeds the input limit despite a misleading size header', async () => {
    let canceled = false;
    const input = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(100000).fill(65)); },
      cancel() { canceled = true; },
    });
    await expect(extractDocumentText(input)).rejects.toThrow(/256/);
    expect(canceled).toBe(true);
  });
});
