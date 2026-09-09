export interface EmailReadiness {
  state: 'CONFIGURED' | 'UNAVAILABLE'
  provider: 'Resend'
  sender: string | null
  applicationUrl: string | null
  message: string
}

function configuredApplicationUrl(env: NodeJS.ProcessEnv): string {
  return env.APP_URL ?? env.AUTH_URL ?? env.NEXT_PUBLIC_APP_URL ?? ''
}

export function getApplicationBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = configuredApplicationUrl(env)
  if (!configured) throw new Error('APP_URL is required for email links.')

  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw new Error('APP_URL must be a valid absolute URL.')
  }
  if (url.username || url.password) throw new Error('APP_URL must not include credentials.')
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !localHttp) throw new Error('APP_URL must use HTTPS outside local development.')
  return url.origin
}

export function emailReadiness(env: NodeJS.ProcessEnv = process.env): EmailReadiness {
  let applicationUrl: string | null = null
  try {
    applicationUrl = getApplicationBaseUrl(env)
  } catch {
    // The actionable, credential-free message is returned below.
  }

  const sender = env.EMAIL_FROM?.trim() || null
  const missing = [
    !env.RESEND_API_KEY ? 'RESEND_API_KEY' : null,
    !sender ? 'EMAIL_FROM' : null,
    !applicationUrl ? 'APP_URL' : null,
  ].filter(Boolean)

  if (missing.length) {
    return {
      state: 'UNAVAILABLE',
      provider: 'Resend',
      sender,
      applicationUrl,
      message: `Email is unavailable. Configure ${missing.join(', ')}.`,
    }
  }

  return {
    state: 'CONFIGURED',
    provider: 'Resend',
    sender,
    applicationUrl,
    message: 'Email is configured. Use the test below to verify provider acceptance.',
  }
}
