import crypto from "node:crypto"

/**
 * Maximum age (in seconds) of a Slack request before we reject it. Slack
 * recommends 5 minutes (300s) to prevent replay attacks. We use a slightly
 * generous 5 minutes to tolerate clock drift between Slack and our servers.
 */
const MAX_REQUEST_AGE_SECONDS = 5 * 60

export interface VerifyResult {
  /** Whether the request is authentic. When false, callers should return 401. */
  ok: boolean
  /** Reason verification failed — useful for logging without leaking details to clients. */
  reason?:
    | "no_signing_secret"
    | "missing_headers"
    | "stale_timestamp"
    | "bad_signature"
}

/**
 * Verify a Slack request's HMAC signature per the standard scheme described at
 * https://api.slack.com/authentication/verifying-requests-from-slack.
 *
 * - Compares `v0=hmac_sha256(signingSecret, "v0:" + timestamp + ":" + rawBody)`
 *   against the `x-slack-signature` header in constant time.
 * - Rejects requests with a timestamp older than {@link MAX_REQUEST_AGE_SECONDS}
 *   to prevent replay attacks.
 *
 * @param rawBody The raw request body as a string. Must be the exact bytes
 *   Slack sent — never re-stringified JSON, since whitespace differences will
 *   break the HMAC.
 * @param headers Either a `Headers` instance (from `Request.headers`) or a
 *   plain `Record<string, string>` for tests.
 * @param signingSecret The org's Slack signing secret. If undefined or empty,
 *   verification fails with `no_signing_secret`.
 * @param now Time of comparison. Defaults to the current time; injectable for
 *   deterministic tests.
 */
export function verifySlackRequest(
  rawBody: string,
  headers: Headers | Record<string, string>,
  signingSecret: string | undefined,
  now: Date = new Date(),
): VerifyResult {
  if (!signingSecret) {
    return { ok: false, reason: "no_signing_secret" }
  }

  const timestamp = getHeader(headers, "x-slack-request-timestamp")
  const signature = getHeader(headers, "x-slack-signature")
  if (!timestamp || !signature) {
    return { ok: false, reason: "missing_headers" }
  }

  const ts = parseInt(timestamp, 10)
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: "missing_headers" }
  }

  const ageSeconds = Math.abs(now.getTime() / 1000 - ts)
  if (ageSeconds > MAX_REQUEST_AGE_SECONDS) {
    return { ok: false, reason: "stale_timestamp" }
  }

  const sigBase = `v0:${timestamp}:${rawBody}`
  const expected = `v0=${crypto
    .createHmac("sha256", signingSecret)
    .update(sigBase)
    .digest("hex")}`

  // timingSafeEqual rejects buffers of different length, so guard first to
  // avoid the throw on the unhappy path.
  const expectedBuf = Buffer.from(expected)
  const actualBuf = Buffer.from(signature)
  if (expectedBuf.length !== actualBuf.length) {
    return { ok: false, reason: "bad_signature" }
  }
  if (!crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    return { ok: false, reason: "bad_signature" }
  }

  return { ok: true }
}

function getHeader(
  headers: Headers | Record<string, string>,
  name: string,
): string | null {
  if (headers instanceof Headers) {
    return headers.get(name)
  }
  // Plain object — case-insensitive lookup.
  const lower = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v
  }
  return null
}
