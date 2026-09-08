// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { finalizeAgentResponse } from './response';

describe('agent response cleanup', () => {
  it('awaits lease release before consumer cancellation completes', async () => {
    let release!: () => void;
    const cleanup = new Promise<void>(resolve => { release = resolve; });
    const finish = vi.fn(() => cleanup);
    const response = finalizeAgentResponse(new Response(new ReadableStream()), finish);
    let cancelled = false;
    const pending = response.body!.cancel().then(() => { cancelled = true; });
    await vi.waitFor(() => expect(finish).toHaveBeenCalled());
    expect(cancelled).toBe(false);
    release();
    await pending;
    expect(cancelled).toBe(true);
  });

  it('releases the lease when the source aborts with an error', async () => {
    const finish = vi.fn(async () => {});
    const response = finalizeAgentResponse(new Response(new ReadableStream({
      start(controller) { controller.error(new Error('aborted')); },
    })), finish);
    await expect(response.text()).rejects.toThrow('aborted');
    expect(finish).toHaveBeenCalledOnce();
  });
});
