import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KeyboardShortcuts, FOCUS_SEARCH_EVENT } from './KeyboardShortcuts'

function fireKey(opts: {
  key: string
  meta?: boolean
  ctrl?: boolean
  shift?: boolean
}) {
  document.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: opts.key,
      metaKey: opts.meta ?? false,
      ctrlKey: opts.ctrl ?? false,
      shiftKey: opts.shift ?? false,
      bubbles: true,
      cancelable: true,
    }),
  )
}

describe('KeyboardShortcuts', () => {
  it('should open the help dialog when "?" is pressed', async () => {
    render(<KeyboardShortcuts />)
    expect(screen.queryByRole('heading', { name: /keyboard shortcuts/i })).not.toBeInTheDocument()
    fireKey({ key: '?', shift: true })
    expect(
      await screen.findByRole('heading', { name: /keyboard shortcuts/i }),
    ).toBeInTheDocument()
  })

  it('should toggle the help dialog closed on second "?"', async () => {
    render(<KeyboardShortcuts />)
    fireKey({ key: '?', shift: true })
    await screen.findByRole('heading', { name: /keyboard shortcuts/i })
    fireKey({ key: '?', shift: true })
    await vi.waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /keyboard shortcuts/i }),
      ).not.toBeInTheDocument()
    })
  })

  it('should list the documented shortcuts in the help dialog', async () => {
    render(<KeyboardShortcuts />)
    fireKey({ key: '?', shift: true })
    expect(await screen.findByText(/open this keyboard shortcuts help/i)).toBeInTheDocument()
    expect(screen.getByText(/focus search/i)).toBeInTheDocument()
    expect(screen.getByText(/close dialogs/i)).toBeInTheDocument()
  })

  it('should dispatch a focus-search event on Ctrl+K', () => {
    const listener = vi.fn()
    window.addEventListener(FOCUS_SEARCH_EVENT, listener)
    render(<KeyboardShortcuts />)
    fireKey({ key: 'k', ctrl: true })
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener(FOCUS_SEARCH_EVENT, listener)
  })

  it('should dispatch a focus-search event on Cmd+K', () => {
    const listener = vi.fn()
    window.addEventListener(FOCUS_SEARCH_EVENT, listener)
    render(<KeyboardShortcuts />)
    fireKey({ key: 'k', meta: true })
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener(FOCUS_SEARCH_EVENT, listener)
  })

  it('should NOT dispatch focus-search on a bare "k" press', () => {
    const listener = vi.fn()
    window.addEventListener(FOCUS_SEARCH_EVENT, listener)
    render(<KeyboardShortcuts />)
    fireKey({ key: 'k' })
    expect(listener).not.toHaveBeenCalled()
    window.removeEventListener(FOCUS_SEARCH_EVENT, listener)
  })
})
