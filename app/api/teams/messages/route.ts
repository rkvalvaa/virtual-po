/**
 * Commands stay unavailable until a supported Bot Framework adapter validates
 * tokens and maps tenant/user identities to VPO membership. Keep this route
 * outside the proxy's machine-authentication allowlist. Never parse activities
 * or acknowledge nonexistent requests.
 */
export async function POST(request: Request): Promise<Response> {
  void request;
  return Response.json({
    error: 'Teams bot commands are unavailable. Submit and track requests in the VPO web app.',
    code: 'TEAMS_COMMANDS_UNAVAILABLE',
  }, { status: 503 });
}
