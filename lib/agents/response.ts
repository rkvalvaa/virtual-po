/** Keep lease cleanup inside the response lifecycle, including consumer cancellation. */
export function finalizeAgentResponse(response: Response, finish: () => Promise<void>): Response {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Agent response has no stream');
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          await finish();
          controller.close();
        } else controller.enqueue(chunk.value);
      } catch (error) {
        await finish();
        controller.error(error);
      }
    },
    async cancel(reason) {
      try { await reader.cancel(reason); } finally { await finish(); }
    },
  });
  return new Response(body, { status: response.status, headers: response.headers });
}
