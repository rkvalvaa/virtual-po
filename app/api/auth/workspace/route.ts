import { auth } from '@/auth';

/** Read-only check: unlike Auth.js /session this response must not rotate a
 * cookie read before another tab's in-flight workspace switch completes. */
export async function GET() {
  const session = await auth();
  const user = session?.user;
  return Response.json({ user: user?.id && user.orgId ? {
    id: user.id, orgId: user.orgId, role: user.role,
  } : null }, { headers: { 'Cache-Control': 'private, no-store' } });
}
