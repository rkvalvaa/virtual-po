import {
  streamText,
  stepCountIs,
  UIMessage,
  convertToModelMessages,
} from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { SECURITY_SYSTEM_PROMPT } from '@/lib/agents/prompts/security';
import { createSecurityTools } from '@/lib/agents/tools/security-tools';
import { getFeatureRequestById } from '@/lib/db/queries/feature-requests';
import '@/lib/auth/types';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { requestId } = await params;

  if (!requestId || typeof requestId !== 'string') {
    return NextResponse.json(
      { error: 'requestId is required' },
      { status: 400 }
    );
  }

  let body: { messages: UIMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { messages } = body;

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

  if (!featureRequest.intakeComplete) {
    return NextResponse.json(
      { error: 'Intake must be completed before security review' },
      { status: 400 }
    );
  }

  const tools = createSecurityTools(requestId, session.user.orgId);

  const systemPrompt = `${SECURITY_SYSTEM_PROMPT}

## Feature Request Context

**Title:** ${featureRequest.title}
**Summary:** ${featureRequest.summary ?? 'No summary provided'}

### Intake Data
\`\`\`json
${JSON.stringify(featureRequest.intakeData, null, 2)}
\`\`\`

### Assessment Data
\`\`\`json
${JSON.stringify(featureRequest.assessmentData ?? {}, null, 2)}
\`\`\``;

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(3),
  });

  return result.toUIMessageStreamResponse();
}
