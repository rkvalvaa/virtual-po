import { convertToModelMessages, streamText, stepCountIs, type ToolSet, type UIMessage } from 'ai';
import { after, NextResponse } from 'next/server';
import { anthropic, AGENT_MODEL } from './client';
import { createAgentTelemetry } from './telemetry';
import { AgentAccessError, beginAgentRun, finishAgentRun, type AgentScope } from './runs';
import { finalizeAgentResponse } from './response';
import { randomUUID } from 'node:crypto';
import { prepareAgentMessages, saveAgentReply } from './history';

export async function createGuardedAgentStream(options: {
  scope: AgentScope;
  system: string;
  messages: UIMessage[];
  signal: AbortSignal;
  createTools: (runId: string) => ToolSet;
}): Promise<Response> {
  let runId: string | undefined;
  try {
    const run = await beginAgentRun(options.scope);
    runId = run.id;
    const runScope = { ...options.scope, runId: run.id };
    const history = await prepareAgentMessages(runScope, options.messages);
    const messages = await convertToModelMessages(history, { ignoreIncompleteToolCalls: true });
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
    let streamFailed = false;
    const result = streamText({
      model: anthropic(AGENT_MODEL),
      system: options.system,
      messages,
      tools: options.createTools(run.id),
      stopWhen: stepCountIs(5),
      abortSignal: AbortSignal.any([options.signal, cancellation.signal, AbortSignal.timeout(120_000)]),
      onFinish: telemetry,
      onError: () => { streamFailed = true; },
    });
    return finalizeAgentResponse(result.toUIMessageStreamResponse({
      originalMessages: history,
      generateMessageId: randomUUID,
      onFinish: async ({ responseMessage, isAborted }) => {
        try {
          await saveAgentReply(runScope, responseMessage);
          await finish(isAborted || streamFailed || options.signal.aborted || cancellation.signal.aborted ? 'FAILED' : 'SUCCEEDED');
        } catch (error) {
          await finish('FAILED');
          throw error;
        }
      },
    }), cleanup, () => cancellation.abort());
  } catch (error) {
    if (runId) await finishAgentRun(runId, 'FAILED');
    if (error instanceof AgentAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Unable to start the agent. Check the request and retry.' }, { status: 400 });
  }
}
