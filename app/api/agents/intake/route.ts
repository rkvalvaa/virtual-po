import {
  streamText,
  stepCountIs,
  UIMessage,
  convertToModelMessages,
} from 'ai';
import { anthropic, AGENT_MODEL as MODEL } from '@/lib/agents/client';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { INTAKE_SYSTEM_PROMPT } from '@/lib/agents/prompts/intake';
import { createIntakeTools } from '@/lib/agents/tools/intake-tools';
import { getFeatureRequestById } from '@/lib/db/queries/feature-requests';
import { createAgentTelemetry } from '@/lib/agents/telemetry';
import '@/lib/auth/types';


export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { messages: UIMessage[]; requestId: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { messages, requestId } = body;

  if (!requestId || typeof requestId !== 'string') {
    return NextResponse.json(
      { error: 'requestId is required' },
      { status: 400 }
    );
  }

  if (!Array.isArray(messages)) {
    return NextResponse.json(
      { error: 'messages must be an array' },
      { status: 400 }
    );
  }

  const featureRequest = await getFeatureRequestById(requestId);
  if (!featureRequest) {
    return NextResponse.json(
      { error: 'Feature request not found' },
      { status: 404 }
    );
  }

  if (featureRequest.organizationId !== session.user.orgId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tools = createIntakeTools(requestId, session.user.orgId, session.user.id);

  const result = streamText({
    model: anthropic(MODEL),
    system: `${INTAKE_SYSTEM_PROMPT}\n\nCurrent request ID: ${requestId}`,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(5),
    onFinish: createAgentTelemetry({
      agent: 'intake',
      model: MODEL,
      orgId: session.user.orgId,
      requestId,
      userId: session.user.id,
    }),
  });

  return result.toUIMessageStreamResponse();
}
