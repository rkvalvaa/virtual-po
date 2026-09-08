import { readAgentBody, agentErrorResponse, isAgentRequestId } from '@/lib/agents/input';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { SECURITY_SYSTEM_PROMPT } from '@/lib/agents/prompts/security';
import { createSecurityTools } from '@/lib/agents/tools/security-tools';
import { getFeatureRequestById } from '@/lib/db/queries/feature-requests';
import { createGuardedAgentStream } from '@/lib/agents/stream';
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

  if (!isAgentRequestId(requestId)) {
    return NextResponse.json(
      { error: 'requestId is required' },
      { status: 400 }
    );
  }

  let body: Awaited<ReturnType<typeof readAgentBody>>;
  try {
    body = await readAgentBody(req);
  } catch (error) {
    return agentErrorResponse(error);
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

  const { orgId, id: userId } = session.user;
  return createGuardedAgentStream({
    scope: { agent: 'security', orgId, requestId, userId },
    system: systemPrompt,
    messages,
    signal: req.signal,
    createTools: runId => createSecurityTools(requestId, orgId, userId, runId),
  });
}
