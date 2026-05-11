import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// React Testing Library does not auto-clean the DOM under Vitest unless
// vitest's globals are enabled, so register cleanup explicitly here.
afterEach(() => {
  cleanup()
})
