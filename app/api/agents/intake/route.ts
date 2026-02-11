import {
  streamText,
  stepCountIs,
  UIMessage,
  convertToModelMessages,
} from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { INTAKE_SYSTEM_PROMPT } from '@/lib/agents/prompts/intake';
import { createIntakeTools } from '@/lib/agents/tools/intake-tools';
import { getFeatureRequestById } from '@/lib/db/queries/feature-requests';
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

  const tools = createIntakeTools(requestId, session.user.orgId);

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    system: `${INTAKE_SYSTEM_PROMPT}\n\nCurrent request ID: ${requestId}`,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
