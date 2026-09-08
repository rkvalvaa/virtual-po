import { convertToModelMessages, streamText, stepCountIs, type ToolSet, type UIMessage } from 'ai';
import { after, NextResponse } from 'next/server';
import { anthropic, AGENT_MODEL } from './client';
import { createAgentTelemetry } from './telemetry';
import { AgentAccessError, beginAgentRun, finishAgentRun, type AgentScope } from './runs';
import { finalizeAgentResponse } from './response';

export async function createGuardedAgentStream(options: {
  scope: AgentScope;
  system: string;
  messages: UIMessage[];
  signal: AbortSignal;
  createTools: (runId: string) => ToolSet;
}): Promise<Response> {
  let runId: string | undefined;
  try {
    const messages = await convertToModelMessages(options.messages);
    const run = await beginAgentRun(options.scope);
    runId = run.id;
    const finish = (status: 'SUCCEEDED' | 'FAILED') => finishAgentRun(run.id, status);
    const cancellation = new AbortController();
    const cleanup = async () => {
      cancellation.abort();
      await finish('FAILED');
    };
    // Next keeps this task alive even when a disconnected consumer stops reading.
    after(cleanup);
    const telemetry = createAgentTelemetry({
      ...options.scope, model: AGENT_MODEL,
    });
    const result = streamText({
      model: anthropic(AGENT_MODEL),
      system: options.system,
      messages,
      tools: options.createTools(run.id),
      stopWhen: stepCountIs(5),
      abortSignal: AbortSignal.any([options.signal, cancellation.signal, AbortSignal.timeout(120_000)]),
      onFinish: async (event) => {
        try { await telemetry(event); } finally { await finish('SUCCEEDED'); }
      },
      onError: async () => { await finish('FAILED'); },
    });
    return finalizeAgentResponse(result.toUIMessageStreamResponse(), cleanup);
  } catch (error) {
    if (runId) await finishAgentRun(runId, 'FAILED');
    if (error instanceof AgentAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Unable to start the agent. Check the request and retry.' }, { status: 400 });
  }
}
