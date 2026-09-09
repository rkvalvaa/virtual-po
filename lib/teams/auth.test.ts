// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { resetTeamsKeyCacheForTests, verifyTeamsActivityToken } from './auth'

describe('Bot Framework token verification', () => {
  beforeEach(() => { vi.stubEnv('TEAMS_BOT_APP_ID', 'bot-app-id'); resetTeamsKeyCacheForTests() })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it('requires the signed issuer, audience, service URL, and Teams endorsement', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const jwk = await exportJWK(publicKey)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'key-1', endorsements: ['msteams'] }] }), { status: 200 })))
    const token = await new SignJWT({ serviceurl: 'https://smba.trafficmanager.net/teams' })
      .setProtectedHeader({ alg: 'RS256', kid: 'key-1' }).setIssuer('https://api.botframework.com').setAudience('bot-app-id').setIssuedAt().setNotBefore('0s').setExpirationTime('5m').sign(privateKey)
    await expect(verifyTeamsActivityToken(token, { serviceUrl: 'https://smba.trafficmanager.net/teams', channelId: 'msteams' })).resolves.toEqual({ appId: 'bot-app-id' })
    await expect(verifyTeamsActivityToken(token, { serviceUrl: 'https://attacker.example', channelId: 'msteams' })).rejects.toThrow('service URL')
    const missingLifetime = await new SignJWT({ serviceurl: 'https://smba.trafficmanager.net/teams' })
      .setProtectedHeader({ alg: 'RS256', kid: 'key-1' }).setIssuer('https://api.botframework.com').setAudience('bot-app-id').sign(privateKey)
    await expect(verifyTeamsActivityToken(missingLifetime, { serviceUrl: 'https://smba.trafficmanager.net/teams', channelId: 'msteams' })).rejects.toThrow('lifetime')
    const wrongAudience = await new SignJWT({ serviceurl: 'https://smba.trafficmanager.net/teams' })
      .setProtectedHeader({ alg: 'RS256', kid: 'key-1' }).setIssuer('https://api.botframework.com').setAudience('other-app').setNotBefore('0s').setExpirationTime('5m').sign(privateKey)
    await expect(verifyTeamsActivityToken(wrongAudience, { serviceUrl: 'https://smba.trafficmanager.net/teams', channelId: 'msteams' })).rejects.toThrow()
    const wrongIssuer = await new SignJWT({ serviceurl: 'https://smba.trafficmanager.net/teams' })
      .setProtectedHeader({ alg: 'RS256', kid: 'key-1' }).setIssuer('https://attacker.example').setAudience('bot-app-id').setNotBefore('0s').setExpirationTime('5m').sign(privateKey)
    await expect(verifyTeamsActivityToken(wrongIssuer, { serviceUrl: 'https://smba.trafficmanager.net/teams', channelId: 'msteams' })).rejects.toThrow()
  })

  it('requires a Teams-endorsed key and refreshes cached JWKS once for an unknown key id', async () => {
    const first = await generateKeyPair('RS256'), rotated = await generateKeyPair('RS256')
    const firstJwk = await exportJWK(first.publicKey), rotatedJwk = await exportJWK(rotated.publicKey)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ keys: [{ ...firstJwk, kid: 'old', endorsements: ['msteams'] }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ keys: [{ ...rotatedJwk, kid: 'new', endorsements: ['msteams'] }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const token = await new SignJWT({ serviceurl: 'https://smba.trafficmanager.net/teams' }).setProtectedHeader({ alg: 'RS256', kid: 'new' })
      .setIssuer('https://api.botframework.com').setAudience('bot-app-id').setNotBefore('0s').setExpirationTime('5m').sign(rotated.privateKey)
    await expect(verifyTeamsActivityToken(token, { serviceUrl: 'https://smba.trafficmanager.net/teams', channelId: 'msteams' })).resolves.toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    resetTeamsKeyCacheForTests()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ keys: [{ ...rotatedJwk, kid: 'new', endorsements: ['webchat'] }] }), { status: 200 })))
    await expect(verifyTeamsActivityToken(token, { serviceUrl: 'https://smba.trafficmanager.net/teams', channelId: 'msteams' })).rejects.toThrow('endorsed')
  })
})
