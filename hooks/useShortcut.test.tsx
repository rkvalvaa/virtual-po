import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { useShortcut } from './useShortcut'

function Harness({
  shortcutKey,
  meta = false,
  shift = false,
  allowInForms = false,
  onFire,
}: {
  shortcutKey: string
  meta?: boolean
  shift?: boolean
  allowInForms?: boolean
  onFire: (e: KeyboardEvent) => void
}) {
  useShortcut(shortcutKey, onFire, { meta, shift, allowInForms })
  return (
    <>
      <input data-testid="text-input" />
      <textarea data-testid="text-area" />
      <div data-testid="content" contentEditable />
    </>
  )
}

function fireKey(opts: {
  key: string
  meta?: boolean
  ctrl?: boolean
  shift?: boolean
  target?: HTMLElement
}) {
  const event = new KeyboardEvent('keydown', {
    key: opts.key,
    metaKey: opts.meta ?? false,
    ctrlKey: opts.ctrl ?? false,
    shiftKey: opts.shift ?? false,
    bubbles: true,
    cancelable: true,
  })
  if (opts.target) {
    Object.defineProperty(event, 'target', { value: opts.target, writable: false })
  }
  document.dispatchEvent(event)
  return event
}

afterEach(() => {
  cleanup()
})

describe('useShortcut', () => {
  it('should fire when the matching key is pressed without modifiers', () => {
    const onFire = vi.fn()
    render(<Harness shortcutKey="?" shift onFire={onFire} />)
    fireKey({ key: '?', shift: true })
    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('should match keys case-insensitively', () => {
    const onFire = vi.fn()
    render(<Harness shortcutKey="K" meta onFire={onFire} />)
    fireKey({ key: 'k', meta: true })
    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('should not fire for a different key', () => {
    const onFire = vi.fn()
    render(<Harness shortcutKey="j" onFire={onFire} />)
    fireKey({ key: 'k' })
    expect(onFire).not.toHaveBeenCalled()
  })

  it('should require Ctrl OR Meta when meta option is set', () => {
    const onFire = vi.fn()
    render(<Harness shortcutKey="k" meta onFire={onFire} />)
    // No modifier — should not fire.
    fireKey({ key: 'k' })
    expect(onFire).not.toHaveBeenCalled()
    // Ctrl — should fire.
    fireKey({ key: 'k', ctrl: true })
    // Meta (Cmd) — should also fire.
    fireKey({ key: 'k', meta: true })
    expect(onFire).toHaveBeenCalledTimes(2)
  })

  it('should NOT fire when modifiers are present but meta option is not set', () => {
    const onFire = vi.fn()
    render(<Harness shortcutKey="j" onFire={onFire} />)
    fireKey({ key: 'j', meta: true })
    fireKey({ key: 'j', ctrl: true })
    expect(onFire).not.toHaveBeenCalled()
  })

  it('should respect the shift option', () => {
    const onFire = vi.fn()
    render(<Harness shortcutKey="?" shift onFire={onFire} />)
    // Without shift — should not fire.
    fireKey({ key: '?' })
    expect(onFire).not.toHaveBeenCalled()
    // With shift — should fire.
    fireKey({ key: '?', shift: true })
    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('should ignore key presses while focus is in an input by default', () => {
    const onFire = vi.fn()
    const { getByTestId } = render(<Harness shortcutKey="j" onFire={onFire} />)
    const input = getByTestId('text-input') as HTMLInputElement
    fireKey({ key: 'j', target: input })
    expect(onFire).not.toHaveBeenCalled()
  })

  it('should ignore key presses in a textarea by default', () => {
    const onFire = vi.fn()
    const { getByTestId } = render(<Harness shortcutKey="j" onFire={onFire} />)
    const textarea = getByTestId('text-area') as HTMLTextAreaElement
    fireKey({ key: 'j', target: textarea })
    expect(onFire).not.toHaveBeenCalled()
  })

  it('should ignore key presses in contentEditable elements by default', () => {
    const onFire = vi.fn()
    const { getByTestId } = render(<Harness shortcutKey="j" onFire={onFire} />)
    const content = getByTestId('content') as HTMLElement
    // jsdom does not set isContentEditable from the `contentEditable` JSX
    // attribute alone; force it on for the assertion.
    Object.defineProperty(content, 'isContentEditable', { value: true, configurable: true })
    fireKey({ key: 'j', target: content })
    expect(onFire).not.toHaveBeenCalled()
  })

  it('should fire in form fields when allowInForms is true', () => {
    const onFire = vi.fn()
    const { getByTestId } = render(
      <Harness shortcutKey="k" meta allowInForms onFire={onFire} />,
    )
    const input = getByTestId('text-input') as HTMLInputElement
    fireKey({ key: 'k', meta: true, target: input })
    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('should remove its listener on unmount', () => {
    const onFire = vi.fn()
    const { unmount } = render(<Harness shortcutKey="j" onFire={onFire} />)
    unmount()
    fireKey({ key: 'j' })
    expect(onFire).not.toHaveBeenCalled()
  })
})
