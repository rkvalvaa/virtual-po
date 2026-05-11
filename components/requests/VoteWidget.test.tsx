import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VoteWidget } from './VoteWidget'

const submitVote = vi.fn()
const removeVote = vi.fn()

vi.mock('@/app/(dashboard)/requests/[id]/vote-actions', () => ({
  submitVote: (...args: unknown[]) => submitVote(...args),
  removeVote: (...args: unknown[]) => removeVote(...args),
}))

function defaultProps(overrides: Partial<React.ComponentProps<typeof VoteWidget>> = {}) {
  return {
    requestId: 'req-1',
    currentVote: null,
    votes: [],
    summary: { voteCount: 0, averageScore: 0 },
    ...overrides,
  }
}

describe('VoteWidget', () => {
  beforeEach(() => {
    submitVote.mockReset()
    removeVote.mockReset()
  })

  describe('summary rendering', () => {
    it('should not show summary numbers when there are no votes', () => {
      render(<VoteWidget {...defaultProps()} />)
      const heading = screen.getByText('Stakeholder Votes')
      expect(heading.parentElement?.textContent).not.toMatch(/avg/)
    })

    it('should show "1 vote" (singular) when there is exactly one', () => {
      render(
        <VoteWidget
          {...defaultProps({ summary: { voteCount: 1, averageScore: 4 } })}
        />,
      )
      expect(screen.getByText(/4\.0 avg \(1 vote\)/)).toBeInTheDocument()
    })

    it('should show "votes" (plural) when there are multiple', () => {
      render(
        <VoteWidget
          {...defaultProps({ summary: { voteCount: 3, averageScore: 3.6667 } })}
        />,
      )
      expect(screen.getByText(/3\.7 avg \(3 votes\)/)).toBeInTheDocument()
    })
  })

  describe('button label', () => {
    it('should say "Submit Vote" when the user has not voted', () => {
      render(<VoteWidget {...defaultProps()} />)
      expect(screen.getByRole('button', { name: /submit vote/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /update vote/i })).not.toBeInTheDocument()
    })

    it('should say "Update Vote" when the user has already voted', () => {
      render(
        <VoteWidget
          {...defaultProps({
            currentVote: { voteValue: 4, rationale: null },
          })}
        />,
      )
      expect(screen.getByRole('button', { name: /update vote/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /submit vote/i })).not.toBeInTheDocument()
    })

    it('should show the Remove button only when a current vote exists', () => {
      const { rerender } = render(<VoteWidget {...defaultProps()} />)
      expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()

      rerender(
        <VoteWidget
          {...defaultProps({
            currentVote: { voteValue: 3, rationale: null },
          })}
        />,
      )
      expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
    })
  })

  describe('submit button disabled state', () => {
    it('should be disabled when no rating is selected', () => {
      render(<VoteWidget {...defaultProps()} />)
      expect(screen.getByRole('button', { name: /submit vote/i })).toBeDisabled()
    })

    it('should be enabled once a rating is selected', async () => {
      const user = userEvent.setup()
      render(<VoteWidget {...defaultProps()} />)
      const stars = screen.getAllByRole('button').filter((b) => b.querySelector('svg.lucide-star'))
      await user.click(stars[2]) // 3rd star
      expect(screen.getByRole('button', { name: /submit vote/i })).toBeEnabled()
    })

    it('should be enabled when the user has an existing vote', () => {
      render(
        <VoteWidget
          {...defaultProps({
            currentVote: { voteValue: 4, rationale: null },
          })}
        />,
      )
      expect(screen.getByRole('button', { name: /update vote/i })).toBeEnabled()
    })
  })

  describe('star selection', () => {
    it('should show "X/5" label after a star is clicked', async () => {
      const user = userEvent.setup()
      render(<VoteWidget {...defaultProps()} />)
      const stars = screen.getAllByRole('button').filter((b) => b.querySelector('svg.lucide-star'))
      await user.click(stars[3])
      expect(screen.getByText('4/5')).toBeInTheDocument()
    })

    it('should pre-fill the rating from currentVote.voteValue', () => {
      render(
        <VoteWidget
          {...defaultProps({
            currentVote: { voteValue: 5, rationale: null },
          })}
        />,
      )
      expect(screen.getByText('5/5')).toBeInTheDocument()
    })
  })

  describe('rationale textarea', () => {
    it('should pre-fill from currentVote.rationale', () => {
      render(
        <VoteWidget
          {...defaultProps({
            currentVote: { voteValue: 4, rationale: 'Looks great' },
          })}
        />,
      )
      expect(screen.getByDisplayValue('Looks great')).toBeInTheDocument()
    })

    it('should default to an empty value when no rationale is set', () => {
      render(<VoteWidget {...defaultProps()} />)
      const textarea = screen.getByPlaceholderText(/why do you think this is important/i)
      expect(textarea).toHaveValue('')
    })

    it('should accept user input', async () => {
      const user = userEvent.setup()
      render(<VoteWidget {...defaultProps()} />)
      const textarea = screen.getByPlaceholderText(/why do you think this is important/i)
      await user.type(textarea, 'important for accessibility')
      expect(textarea).toHaveValue('important for accessibility')
    })
  })

  describe('submit and remove actions', () => {
    it('should call submitVote with requestId, value, and null rationale when blank', async () => {
      const user = userEvent.setup()
      render(<VoteWidget {...defaultProps()} />)
      const stars = screen.getAllByRole('button').filter((b) => b.querySelector('svg.lucide-star'))
      await user.click(stars[3])
      await user.click(screen.getByRole('button', { name: /submit vote/i }))
      expect(submitVote).toHaveBeenCalledWith('req-1', 4, null)
    })

    it('should pass the rationale string when one is entered', async () => {
      const user = userEvent.setup()
      render(<VoteWidget {...defaultProps()} />)
      const stars = screen.getAllByRole('button').filter((b) => b.querySelector('svg.lucide-star'))
      await user.click(stars[1])
      await user.type(
        screen.getByPlaceholderText(/why do you think this is important/i),
        'because',
      )
      await user.click(screen.getByRole('button', { name: /submit vote/i }))
      expect(submitVote).toHaveBeenCalledWith('req-1', 2, 'because')
    })

    it('should not call submitVote when no rating is selected', async () => {
      const user = userEvent.setup()
      render(<VoteWidget {...defaultProps()} />)
      // Submit button is disabled, but userEvent's pointer-events-none check on
      // disabled state will short-circuit the click. Explicitly assert that.
      const submit = screen.getByRole('button', { name: /submit vote/i })
      expect(submit).toBeDisabled()
      await user.click(submit).catch(() => {})
      expect(submitVote).not.toHaveBeenCalled()
    })

    it('should call removeVote with the requestId', async () => {
      const user = userEvent.setup()
      render(
        <VoteWidget
          {...defaultProps({
            currentVote: { voteValue: 4, rationale: 'note' },
          })}
        />,
      )
      await user.click(screen.getByRole('button', { name: /remove/i }))
      expect(removeVote).toHaveBeenCalledWith('req-1')
    })
  })

  describe('other-votes list', () => {
    it('should not render the "All Votes" section when there are none', () => {
      render(<VoteWidget {...defaultProps()} />)
      expect(screen.queryByText(/all votes/i)).not.toBeInTheDocument()
    })

    it('should render every vote in the list', () => {
      render(
        <VoteWidget
          {...defaultProps({
            votes: [
              { voteValue: 5, rationale: 'love it', userName: 'Alice', createdAt: '2026-01-01' },
              { voteValue: 3, rationale: null, userName: 'Bob', createdAt: '2026-01-02' },
              { voteValue: 1, rationale: 'no', userName: 'Carol', createdAt: '2026-01-03' },
            ],
            summary: { voteCount: 3, averageScore: 3 },
          })}
        />,
      )
      const list = screen.getByText(/all votes/i).parentElement
      expect(list).not.toBeNull()
      const scope = within(list as HTMLElement)
      expect(scope.getByText('Alice')).toBeInTheDocument()
      expect(scope.getByText('Bob')).toBeInTheDocument()
      expect(scope.getByText('Carol')).toBeInTheDocument()
    })

    it('should display "Unknown" when userName is null', () => {
      render(
        <VoteWidget
          {...defaultProps({
            votes: [
              { voteValue: 4, rationale: null, userName: null, createdAt: '2026-01-01' },
            ],
            summary: { voteCount: 1, averageScore: 4 },
          })}
        />,
      )
      expect(screen.getByText('Unknown')).toBeInTheDocument()
    })

    it('should render the rationale text when present and omit it when null', () => {
      render(
        <VoteWidget
          {...defaultProps({
            votes: [
              { voteValue: 5, rationale: 'with reason', userName: 'Alice', createdAt: '2026-01-01' },
              { voteValue: 3, rationale: null, userName: 'Bob', createdAt: '2026-01-02' },
            ],
            summary: { voteCount: 2, averageScore: 4 },
          })}
        />,
      )
      expect(screen.getByText('with reason')).toBeInTheDocument()
      // Bob has no rationale; only his name should appear.
      const list = screen.getByText(/all votes/i).parentElement as HTMLElement
      const bobRow = within(list).getByText('Bob').closest('div.flex')
      expect(bobRow).not.toBeNull()
      expect(within(bobRow as HTMLElement).queryByText(/null/)).not.toBeInTheDocument()
    })
  })
})
