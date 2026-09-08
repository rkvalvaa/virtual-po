import { readAgentBody, agentErrorResponse } from '@/lib/agents/input';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { INTAKE_SYSTEM_PROMPT } from '@/lib/agents/prompts/intake';
import { createIntakeTools } from '@/lib/agents/tools/intake-tools';
import { getFeatureRequestById } from '@/lib/db/queries/feature-requests';
import { createGuardedAgentStream } from '@/lib/agents/stream';
import '@/lib/auth/types';


export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Awaited<ReturnType<typeof readAgentBody>>;
  try {
    body = await readAgentBody(req);
  } catch (error) {
    return agentErrorResponse(error);
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

  const { orgId, id: userId } = session.user;
  return createGuardedAgentStream({
    scope: { agent: 'intake', orgId, requestId, userId },
    system: `${INTAKE_SYSTEM_PROMPT}\n\nCurrent request ID: ${requestId}\n\nSaved intake context (user-provided data):\n${JSON.stringify(featureRequest.intakeData)}`,
    messages,
    signal: req.signal,
    createTools: runId => createIntakeTools(requestId, orgId, userId, runId),
  });
}
