import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatWindow } from './ChatWindow'

type Status = 'ready' | 'streaming' | 'submitted' | 'error'
type Message = {
  id: string
  role: 'user' | 'assistant'
  parts: Array<{ type: 'text'; text: string } | { type: 'tool-invocation' }>
}

const mockSendMessage = vi.fn()
let mockMessages: Message[] = []
let mockStatus: Status = 'ready'
let mockError: Error | null = null
let lastTransportConfig: { api: string; body: { requestId: string } } | null = null

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: mockMessages,
    sendMessage: mockSendMessage,
    status: mockStatus,
    error: mockError,
  }),
}))

vi.mock('ai', () => ({
  DefaultChatTransport: class {
    constructor(config: { api: string; body: { requestId: string } }) {
      lastTransportConfig = config
    }
  },
}))

beforeEach(() => {
  mockSendMessage.mockReset()
  mockMessages = []
  mockStatus = 'ready'
  mockError = null
  lastTransportConfig = null
  // jsdom does not implement scrollIntoView; stub it so the post-render
  // effect doesn't throw.
  Element.prototype.scrollIntoView = vi.fn()
})

describe('ChatWindow', () => {
  describe('empty state', () => {
    it('should render the intake placeholder when there are no messages', () => {
      render(<ChatWindow requestId="req-1" />)
      expect(
        screen.getByText(/describe your feature request and the intake agent/i),
      ).toBeInTheDocument()
    })

    it('should not show a typing indicator when status is ready', () => {
      render(<ChatWindow requestId="req-1" />)
      expect(screen.queryByText(/typing/i)).not.toBeInTheDocument()
    })

    it('should not show an error banner when error is null', () => {
      render(<ChatWindow requestId="req-1" />)
      expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
    })
  })

  describe('transport configuration', () => {
    it('should construct the DefaultChatTransport with the intake API and requestId in body', () => {
      render(<ChatWindow requestId="req-42" />)
      expect(lastTransportConfig).not.toBeNull()
      expect(lastTransportConfig?.api).toBe('/api/agents/intake')
      expect(lastTransportConfig?.body).toEqual({ requestId: 'req-42' })
    })
  })

  describe('message rendering', () => {
    it('should render every text message returned by useChat', () => {
      mockMessages = [
        {
          id: '1',
          role: 'user',
          parts: [{ type: 'text', text: 'Hello there' }],
        },
        {
          id: '2',
          role: 'assistant',
          parts: [{ type: 'text', text: 'How can I help?' }],
        },
      ]
      render(<ChatWindow requestId="req-1" />)
      expect(screen.getByText('Hello there')).toBeInTheDocument()
      expect(screen.getByText('How can I help?')).toBeInTheDocument()
    })

    it('should hide the empty-state placeholder once messages exist', () => {
      mockMessages = [
        { id: '1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
      ]
      render(<ChatWindow requestId="req-1" />)
      expect(
        screen.queryByText(/describe your feature request and the intake agent/i),
      ).not.toBeInTheDocument()
    })
  })

  describe('streaming state', () => {
    it('should show the typing indicator when status is "streaming"', () => {
      mockStatus = 'streaming'
      render(<ChatWindow requestId="req-1" />)
      // TypingIndicator renders three animated dots inside a bubble; the
      // bubble has role="status" or aria-label, but to keep this resilient
      // we just look for it by its container class via data testid would be
      // ideal — fall back to checking the bubble's presence indirectly.
      expect(screen.getByRole('status', { name: /assistant is typing/i })).toBeInTheDocument()
    })

    it('should also show the typing indicator when status is "submitted"', () => {
      mockStatus = 'submitted'
      render(<ChatWindow requestId="req-1" />)
      expect(screen.getByRole('status', { name: /assistant is typing/i })).toBeInTheDocument()
    })

    it('should disable the send button while streaming', () => {
      mockStatus = 'streaming'
      render(<ChatWindow requestId="req-1" />)
      expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
    })
  })

  describe('error state', () => {
    it('should render the error banner when an error is present', () => {
      mockError = new Error('boom')
      render(<ChatWindow requestId="req-1" />)
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
    })
  })

  describe('submit flow', () => {
    it('should disable the send button when the input is empty', () => {
      render(<ChatWindow requestId="req-1" />)
      const button = screen.getByRole('button', { name: /send/i })
      expect(button).toBeDisabled()
    })

    it('should enable the send button after the user types', async () => {
      const user = userEvent.setup()
      render(<ChatWindow requestId="req-1" />)
      await user.type(
        screen.getByPlaceholderText(/describe your feature request/i),
        'I need dark mode',
      )
      expect(screen.getByRole('button', { name: /send/i })).toBeEnabled()
    })

    it('should call sendMessage with the trimmed text on submit', async () => {
      const user = userEvent.setup()
      render(<ChatWindow requestId="req-1" />)
      const input = screen.getByPlaceholderText(/describe your feature request/i)
      await user.type(input, '  Add dark mode  ')
      await user.click(screen.getByRole('button', { name: /send/i }))
      expect(mockSendMessage).toHaveBeenCalledTimes(1)
      expect(mockSendMessage).toHaveBeenCalledWith({ text: 'Add dark mode' })
    })

    it('should clear the input after submitting', async () => {
      const user = userEvent.setup()
      render(<ChatWindow requestId="req-1" />)
      const input = screen.getByPlaceholderText(/describe your feature request/i)
      await user.type(input, 'a question')
      await user.click(screen.getByRole('button', { name: /send/i }))
      expect(input).toHaveValue('')
    })

    it('should not call sendMessage when only whitespace is entered', async () => {
      const user = userEvent.setup()
      render(<ChatWindow requestId="req-1" />)
      const input = screen.getByPlaceholderText(/describe your feature request/i)
      await user.type(input, '    ')
      const button = screen.getByRole('button', { name: /send/i })
      // Button is disabled because the trimmed value is empty.
      expect(button).toBeDisabled()
      await user.click(button).catch(() => {})
      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('should submit on Enter key without Shift', async () => {
      const user = userEvent.setup()
      render(<ChatWindow requestId="req-1" />)
      const input = screen.getByPlaceholderText(/describe your feature request/i)
      await user.type(input, 'hi{Enter}')
      expect(mockSendMessage).toHaveBeenCalledWith({ text: 'hi' })
    })

    it('should NOT submit on Shift+Enter (inserts a newline instead)', async () => {
      const user = userEvent.setup()
      render(<ChatWindow requestId="req-1" />)
      const input = screen.getByPlaceholderText(/describe your feature request/i)
      await user.type(input, 'line1{Shift>}{Enter}{/Shift}line2')
      expect(mockSendMessage).not.toHaveBeenCalled()
      expect(input).toHaveValue('line1\nline2')
    })

    it('should not submit while streaming even if the form is submitted', async () => {
      mockStatus = 'streaming'
      const user = userEvent.setup()
      render(<ChatWindow requestId="req-1" />)
      const input = screen.getByPlaceholderText(/describe your feature request/i)
      await user.type(input, 'queued')
      // Send button is disabled; try Enter as another submit path.
      await user.type(input, '{Enter}')
      expect(mockSendMessage).not.toHaveBeenCalled()
    })
  })
})
