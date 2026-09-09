import { createHash } from 'node:crypto';
import { DOCUMENT_LIMITS } from './limits';

export async function extractDocumentText(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let sourceBytes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Document reading timed out. Retry processing.')), 15000);
  });
  try {
    for (;;) {
      const result = await Promise.race([reader.read(), deadline]);
      if (result.done) break;
      sourceBytes += result.value.byteLength;
      if (sourceBytes > DOCUMENT_LIMITS.fileBytes) throw new Error('AI document context supports files up to 256 KiB.');
      chunks.push(result.value);
    }
    let decoded: string;
    try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
    catch { throw new Error('Document must contain valid UTF-8 text.'); }
    // Control characters other than tab/newline/CR indicate binary input.
    if ([...decoded].some(char => char.charCodeAt(0) < 32 && !['\t', '\n', '\r'].includes(char))) {
      throw new Error('Document appears to contain binary data.');
    }
    const normalized = decoded.replace(/\r\n?/g, '\n');
    const bytes = new TextEncoder().encode(normalized);
    const truncated = bytes.byteLength > DOCUMENT_LIMITS.textBytes;
    // stream:true discards an incomplete trailing multibyte sequence.
    const text = truncated
      ? new TextDecoder().decode(bytes.subarray(0, DOCUMENT_LIMITS.textBytes), { stream: true })
      : normalized;
    return { text, truncated, sourceBytes, lineCount: text.split('\n').length,
      contentHash: createHash('sha256').update(text).digest('hex') };
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    reader.releaseLock();
  }
}
