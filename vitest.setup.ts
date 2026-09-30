import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Integration configs are encrypted at rest; tests get a fixed throwaway key.
process.env.INTEGRATION_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64')

// React Testing Library does not auto-clean the DOM under Vitest unless
// vitest's globals are enabled, so register cleanup explicitly here.
afterEach(() => {
  cleanup()
})
