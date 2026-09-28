import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { upload } from '@vercel/blob/client'
import { PortalAttachments } from './PortalAttachments'

vi.mock('@vercel/blob/client', () => ({ upload: vi.fn() }))

const stagingPrefix = 'portal/c1/f1/k1/'

describe('PortalAttachments', () => {
  beforeEach(() => vi.mocked(upload).mockReset())

  it('uploads each file straight to storage and submits its stored path with the form', async () => {
    const user = userEvent.setup()
    vi.mocked(upload).mockImplementation(async (...args: unknown[]) => {
      return { pathname: String(args[0]).replace('.pdf', '-AbC.pdf') } as Awaited<ReturnType<typeof upload>>
    })
    const { container } = render(<form><PortalAttachments formId="f1" submissionKey="k1" stagingPrefix={stagingPrefix} maxFiles={2} onBusyChange={() => {}} /></form>)
    const file = new File(['x'], 'plan.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Attach files (up to 2)'), file)

    await waitFor(() => expect(container.querySelector('input[name="__attachment"]')).not.toBeNull())
    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload).toHaveBeenCalledWith(`${stagingPrefix}plan.pdf`, file, expect.objectContaining({
      access: 'private', handleUploadUrl: '/portal/upload', clientPayload: JSON.stringify({ formId: 'f1', submissionKey: 'k1' }),
    }))
    const hidden = container.querySelector('input[name="__attachment"]') as HTMLInputElement
    expect(JSON.parse(hidden.value)).toEqual({ pathname: `${stagingPrefix}plan-AbC.pdf`, name: 'plan.pdf' })
    expect(screen.getByText('plan.pdf')).toBeInTheDocument()
  })

  it('refuses files beyond the form limit without uploading them', async () => {
    const user = userEvent.setup()
    render(<form><PortalAttachments formId="f1" submissionKey="k1" stagingPrefix={stagingPrefix} maxFiles={1} onBusyChange={() => {}} /></form>)
    await user.upload(screen.getByLabelText('Attach files (up to 1)'), [
      new File(['a'], 'a.pdf', { type: 'application/pdf' }), new File(['b'], 'b.pdf', { type: 'application/pdf' }),
    ])
    expect(await screen.findByRole('alert')).toHaveTextContent('You can attach up to 1 file')
    expect(upload).not.toHaveBeenCalled()
  })
})
