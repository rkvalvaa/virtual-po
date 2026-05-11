import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommentThread, type CommentNode } from './CommentThread'

// next/navigation is used by the CommentInput child; mock the router so
// the form submission inside doesn't crash.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

// addComment server action is called by CommentInput on submit.
const addComment = vi.fn()
vi.mock('@/app/(dashboard)/requests/[id]/actions', () => ({
  addComment: (...args: unknown[]) => addComment(...args),
}))

function comment(overrides: Partial<CommentNode>): CommentNode {
  return {
    id: 'c1',
    content: 'Hello',
    authorName: 'Alice',
    parentId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  addComment.mockReset()
})

describe('CommentThread', () => {
  describe('empty state', () => {
    it('should show "No comments yet." when there are no comments', () => {
      render(<CommentThread requestId="req-1" comments={[]} />)
      expect(screen.getByText(/no comments yet/i)).toBeInTheDocument()
    })

    it('should always render the top-level CommentInput', () => {
      render(<CommentThread requestId="req-1" comments={[]} />)
      expect(screen.getByPlaceholderText(/add a comment/i)).toBeInTheDocument()
    })
  })

  describe('flat rendering', () => {
    it('should render every top-level comment', () => {
      render(
        <CommentThread
          requestId="req-1"
          comments={[
            comment({ id: 'a', content: 'First' }),
            comment({ id: 'b', content: 'Second' }),
          ]}
        />,
      )
      expect(screen.getByText('First')).toBeInTheDocument()
      expect(screen.getByText('Second')).toBeInTheDocument()
    })

    it('should not show the collapse toggle for comments without replies', () => {
      render(
        <CommentThread
          requestId="req-1"
          comments={[comment({ id: 'a', content: 'Lonely' })]}
        />,
      )
      expect(screen.queryByLabelText(/collapse|expand/i)).not.toBeInTheDocument()
    })
  })

  describe('threaded rendering', () => {
    const tree: CommentNode[] = [
      comment({ id: 'root', content: 'Root comment' }),
      comment({ id: 'r1', parentId: 'root', content: 'Reply one', authorName: 'Bob' }),
      comment({ id: 'r2', parentId: 'root', content: 'Reply two', authorName: 'Carol' }),
      comment({ id: 'r1a', parentId: 'r1', content: 'Nested reply', authorName: 'Dan' }),
    ]

    it('should render replies nested under their parent', () => {
      render(<CommentThread requestId="req-1" comments={tree} />)
      expect(screen.getByText('Root comment')).toBeInTheDocument()
      expect(screen.getByText('Reply one')).toBeInTheDocument()
      expect(screen.getByText('Reply two')).toBeInTheDocument()
      expect(screen.getByText('Nested reply')).toBeInTheDocument()
    })

    it('should expose a collapse control on parents that have replies', () => {
      render(<CommentThread requestId="req-1" comments={tree} />)
      expect(screen.getAllByLabelText(/collapse thread/i).length).toBeGreaterThan(0)
    })

    it('should hide all descendants when a thread is collapsed', async () => {
      const user = userEvent.setup()
      render(<CommentThread requestId="req-1" comments={tree} />)

      // Sanity: descendants visible initially.
      expect(screen.getByText('Reply one')).toBeInTheDocument()
      expect(screen.getByText('Nested reply')).toBeInTheDocument()

      // Find the root comment's collapse button. The aria-expanded approach:
      // the toggle on the "Root comment" line is the first collapse control.
      const collapseButtons = screen.getAllByLabelText(/collapse thread/i)
      await user.click(collapseButtons[0])

      expect(screen.queryByText('Reply one')).not.toBeInTheDocument()
      expect(screen.queryByText('Reply two')).not.toBeInTheDocument()
      expect(screen.queryByText('Nested reply')).not.toBeInTheDocument()
    })

    it('should show "Show N replies" link when collapsed with the total descendant count', async () => {
      const user = userEvent.setup()
      render(<CommentThread requestId="req-1" comments={tree} />)
      await user.click(screen.getAllByLabelText(/collapse thread/i)[0])
      // Total descendants of root = 2 direct + 1 nested = 3.
      expect(screen.getByRole('button', { name: /show 3 replies/i })).toBeInTheDocument()
    })

    it('should use singular "reply" when there is exactly one descendant', async () => {
      const user = userEvent.setup()
      render(
        <CommentThread
          requestId="req-1"
          comments={[
            comment({ id: 'root', content: 'Root' }),
            comment({ id: 'r1', parentId: 'root', content: 'Only reply', authorName: 'Bob' }),
          ]}
        />,
      )
      await user.click(screen.getAllByLabelText(/collapse thread/i)[0])
      expect(screen.getByRole('button', { name: /show 1 reply/i })).toBeInTheDocument()
    })

    it('should re-expand the thread when "Show N replies" is clicked', async () => {
      const user = userEvent.setup()
      render(<CommentThread requestId="req-1" comments={tree} />)
      await user.click(screen.getAllByLabelText(/collapse thread/i)[0])
      await user.click(screen.getByRole('button', { name: /show 3 replies/i }))
      expect(screen.getByText('Reply one')).toBeInTheDocument()
      expect(screen.getByText('Nested reply')).toBeInTheDocument()
    })
  })

  describe('reply input', () => {
    it('should expose a Reply button on every comment regardless of depth', () => {
      render(
        <CommentThread
          requestId="req-1"
          comments={[
            comment({ id: 'root', content: 'Root' }),
            comment({ id: 'r1', parentId: 'root', content: 'Reply', authorName: 'Bob' }),
            comment({ id: 'r1a', parentId: 'r1', content: 'Nested', authorName: 'Carol' }),
          ]}
        />,
      )
      // 3 comments + 1 top-level Post Comment button = at least 3 "Reply" buttons.
      const replyButtons = screen.getAllByRole('button', { name: /^reply$/i })
      expect(replyButtons.length).toBe(3)
    })

    it('should reveal a reply textarea when Reply is clicked', async () => {
      const user = userEvent.setup()
      render(
        <CommentThread
          requestId="req-1"
          comments={[comment({ id: 'root', content: 'Root' })]}
        />,
      )
      await user.click(screen.getByRole('button', { name: /^reply$/i }))
      expect(screen.getByPlaceholderText(/write a reply/i)).toBeInTheDocument()
    })

    it('should pass the parent id when the reply is submitted', async () => {
      addComment.mockResolvedValue(undefined)
      const user = userEvent.setup()
      render(
        <CommentThread
          requestId="req-1"
          comments={[comment({ id: 'root', content: 'Root' })]}
        />,
      )
      await user.click(screen.getByRole('button', { name: /^reply$/i }))
      const textarea = screen.getByPlaceholderText(/write a reply/i)
      await user.type(textarea, 'thanks!')
      // Find the submit button inside the reply form (label becomes "Reply" or "Posting...")
      const submit = screen.getAllByRole('button', { name: /^reply$/i })
      // The second one is the submit button inside the reply form (the first
      // is the "Reply" link that toggled it open).
      await user.click(submit[submit.length - 1])
      expect(addComment).toHaveBeenCalledWith('req-1', 'thanks!', 'root')
    })
  })

  describe('relative time formatting', () => {
    it('should show "just now" for recent timestamps', () => {
      render(
        <CommentThread
          requestId="req-1"
          comments={[comment({ id: 'a', content: 'Now', createdAt: new Date().toISOString() })]}
        />,
      )
      const card = screen.getByText('Now').closest('div')
      expect(card?.textContent).toMatch(/just now/)
    })

    it('should show minutes ago for recent past', () => {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      render(
        <CommentThread
          requestId="req-1"
          comments={[comment({ id: 'a', content: 'Earlier', createdAt: tenMinAgo })]}
        />,
      )
      const card = screen.getByText('Earlier').closest('div')
      expect(card?.textContent).toMatch(/10m ago/)
    })

    it('should show hours ago after one hour', () => {
      const twoHrAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      render(
        <CommentThread
          requestId="req-1"
          comments={[comment({ id: 'a', content: 'Hours', createdAt: twoHrAgo })]}
        />,
      )
      expect(
        within(screen.getByText('Hours').closest('div') as HTMLElement).getByText(/2h ago/),
      ).toBeInTheDocument()
    })
  })
})
