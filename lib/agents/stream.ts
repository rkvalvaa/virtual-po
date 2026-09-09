import { convertToModelMessages, streamText, stepCountIs, type ToolSet, type UIMessage } from 'ai';
import { after } from 'next/server';
import { anthropic, AGENT_MODEL } from './client';
import { createAgentTelemetry } from './telemetry';
import { AgentAccessError, beginAgentRun, finishAgentRun, type AgentScope } from './runs';
import { finalizeAgentResponse } from './response';
import { randomUUID } from 'node:crypto';
import { prepareAgentMessages, saveAgentReply } from './history';
import { agentErrorResponse, boundedModelHistory } from './input';
import { AGENT_LIMITS } from './limits';
import { assertAgentToolsWithinBudget } from './budget';

export async function createGuardedAgentStream(options: {
  scope: AgentScope;
  system: string;
  messages: UIMessage[];
  signal: AbortSignal;
  createTools: (runId: string) => ToolSet;
}): Promise<Response> {
  let runId: string | undefined;
  try {
    const candidateRunId = randomUUID();
    const tools = options.createTools(candidateRunId);
    assertAgentToolsWithinBudget(tools);
    const run = await beginAgentRun(options.scope, AGENT_MODEL, candidateRunId);
    runId = run.id;
    const runScope = { ...options.scope, runId: run.id };
    const history = await prepareAgentMessages(runScope, options.messages);
    const messages = await convertToModelMessages(boundedModelHistory(history, options.system), { ignoreIncompleteToolCalls: true });
    const finish = (status: 'SUCCEEDED' | 'FAILED') => finishAgentRun(run.id, status);
    const cancellation = new AbortController();
    const cleanup = async () => {
      cancellation.abort();
      await finish('FAILED');
    };
    // Next keeps this task alive even when a disconnected consumer stops reading.
    after(cleanup);
    const telemetry = createAgentTelemetry({
      ...options.scope, runId: run.id, model: AGENT_MODEL,
    });
    let streamFailed = false;
    const result = streamText({
      model: anthropic(AGENT_MODEL),
      system: options.system,
      messages,
      tools,
      stopWhen: stepCountIs(AGENT_LIMITS.steps),
      maxOutputTokens: AGENT_LIMITS.outputTokensPerStep,
      prepareStep: async ({ messages }) => {
        if (Buffer.byteLength(JSON.stringify(messages) + options.system, 'utf8') > AGENT_LIMITS.inputBytes) {
          throw new AgentAccessError('This stage exceeded its context budget. Shorten the request details and retry.', 413);
        }
        return {};
      },
      abortSignal: AbortSignal.any([options.signal, cancellation.signal, AbortSignal.timeout(120_000)]),
      onFinish: telemetry,
      onError: () => { streamFailed = true; },
    });
    return finalizeAgentResponse(result.toUIMessageStreamResponse({
      originalMessages: history,
      generateMessageId: randomUUID,
      onError: error => error instanceof AgentAccessError ? error.message : 'The AI service could not finish this stage. Your saved progress is safe; retry shortly.',
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
    return agentErrorResponse(error);
  }
}
