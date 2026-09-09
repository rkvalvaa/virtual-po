import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from 'jose'

const ISSUER = 'https://api.botframework.com'
const KEYS_URL = 'https://login.botframework.com/v1/.well-known/keys'
const CACHE_MS = 24 * 60 * 60 * 1000
let cache: { expires: number; keys: Array<JWK & { kid?: string; endorsements?: string[] }> } | null = null

async function signingKeys(force = false) {
  if (!force && cache && cache.expires > Date.now()) return cache.keys
  const response = await fetch(KEYS_URL, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error('Unable to load Bot Framework signing keys.')
  const body = await response.json() as { keys?: Array<JWK & { kid?: string; endorsements?: string[] }> }
  if (!Array.isArray(body.keys)) throw new Error('Invalid Bot Framework signing keys.')
  cache = { keys: body.keys, expires: Date.now() + CACHE_MS }
  return cache.keys
}

export interface TeamsActivityIdentity {
  appId: string
}

export async function verifyTeamsActivityToken(token: string, activity: { serviceUrl?: string; channelId?: string }): Promise<TeamsActivityIdentity> {
  const appId = process.env.TEAMS_BOT_APP_ID
  if (!appId || !activity.serviceUrl || activity.channelId !== 'msteams') throw new Error('Teams commands are not configured.')
  const header = decodeProtectedHeader(token)
  if (!header.kid || header.alg !== 'RS256') throw new Error('Invalid Bot Framework token.')
  let keys = await signingKeys()
  let jwk = keys.find(key => key.kid === header.kid)
  if (!jwk) { keys = await signingKeys(true); jwk = keys.find(key => key.kid === header.kid) }
  if (!jwk || !jwk.endorsements?.includes('msteams')) throw new Error('Signing key is not endorsed for Teams.')
  const key = await importJWK(jwk, 'RS256')
  const verified = await jwtVerify(token, key, { audience: appId, issuer: ISSUER, algorithms: ['RS256'], clockTolerance: 300 })
  if (typeof verified.payload.exp !== 'number' || typeof verified.payload.nbf !== 'number') throw new Error('Bot Framework token lifetime claims are required.')
  if (verified.payload.serviceurl !== activity.serviceUrl && verified.payload.serviceUrl !== activity.serviceUrl) {
    throw new Error('Bot Framework service URL mismatch.')
  }
  return { appId }
}

export function bearerToken(header: string | null): string | null {
  const match = /^Bearer ([^\s]+)$/i.exec(header ?? '')
  return match?.[1] ?? null
}

export function resetTeamsKeyCacheForTests() { cache = null }
