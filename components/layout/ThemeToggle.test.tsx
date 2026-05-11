import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeToggle } from './ThemeToggle'

const setTheme = vi.fn()
let currentTheme: string | undefined = 'system'

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: currentTheme, setTheme }),
}))

beforeEach(() => {
  setTheme.mockReset()
  currentTheme = 'system'
})

describe('ThemeToggle', () => {
  it('should render a button labeled "Toggle theme"', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument()
  })

  it('should expose Light / Dark / System options when opened', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    await user.click(screen.getByRole('button', { name: /toggle theme/i }))
    expect(await screen.findByText('Light')).toBeInTheDocument()
    expect(screen.getByText('Dark')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
  })

  it('should call setTheme("light") when Light is selected', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    await user.click(screen.getByRole('button', { name: /toggle theme/i }))
    await user.click(await screen.findByText('Light'))
    expect(setTheme).toHaveBeenCalledWith('light')
  })

  it('should call setTheme("dark") when Dark is selected', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    await user.click(screen.getByRole('button', { name: /toggle theme/i }))
    await user.click(await screen.findByText('Dark'))
    expect(setTheme).toHaveBeenCalledWith('dark')
  })

  it('should call setTheme("system") when System is selected', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    await user.click(screen.getByRole('button', { name: /toggle theme/i }))
    await user.click(await screen.findByText('System'))
    expect(setTheme).toHaveBeenCalledWith('system')
  })

  it('should mark the active theme in the dropdown', async () => {
    currentTheme = 'dark'
    const user = userEvent.setup()
    render(<ThemeToggle />)
    await user.click(screen.getByRole('button', { name: /toggle theme/i }))
    const darkItem = (await screen.findByText('Dark')).closest('[role="menuitem"]') as HTMLElement
    expect(darkItem).not.toBeNull()
    expect(darkItem.className).toMatch(/font-medium/)
  })
})
