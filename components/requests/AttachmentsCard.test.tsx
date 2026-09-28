import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AttachmentsCard } from './AttachmentsCard'
import { upload } from '@vercel/blob/client'
import { recordUploadedAttachment } from '@/app/(dashboard)/requests/[id]/attachment-actions'

vi.mock('@vercel/blob/client', () => ({ upload: vi.fn() }))
vi.mock('@/app/(dashboard)/requests/[id]/attachment-actions', () => ({ recordUploadedAttachment: vi.fn(), removeAttachment: vi.fn() }))
vi.mock('./DocumentContextControl', () => ({ DocumentContextControl: () => null }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const prefix = 'orgs/o1/requests/r1/'
const pick = (file: File) => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('AttachmentsCard uploads', () => {
  beforeEach(() => { vi.mocked(upload).mockReset(); vi.mocked(recordUploadedAttachment).mockReset() })

  it('uploads straight to private blob storage, then records the stored file', async () => {
    vi.mocked(upload).mockResolvedValue({ pathname: `${prefix}big-AbC.pdf` } as Awaited<ReturnType<typeof upload>>)
    vi.mocked(recordUploadedAttachment).mockResolvedValue({ success: true })
    render(<AttachmentsCard requestId="r1" uploadPrefix={prefix} attachments={[]} />)
    const file = new File([new Uint8Array(9 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
    pick(file)

    await waitFor(() => expect(recordUploadedAttachment).toHaveBeenCalledWith('r1', `${prefix}big-AbC.pdf`, 'big.pdf'))
    expect(upload).toHaveBeenCalledWith(`${prefix}big.pdf`, file, expect.objectContaining({
      access: 'private', handleUploadUrl: '/api/attachments/upload', clientPayload: JSON.stringify({ requestId: 'r1' }), contentType: 'application/pdf',
    }))
  })

  it('reports a failed upload per file and records nothing', async () => {
    vi.mocked(upload).mockRejectedValue(new Error('Feature request not found'))
    render(<AttachmentsCard requestId="r1" uploadPrefix={prefix} attachments={[]} />)
    pick(new File(['x'], 'notes.txt', { type: 'text/plain' }))
    expect(await screen.findByText('notes.txt: upload failed')).toBeInTheDocument()
    expect(recordUploadedAttachment).not.toHaveBeenCalled()
  })

  it('rejects a disallowed type before contacting storage', async () => {
    render(<AttachmentsCard requestId="r1" uploadPrefix={prefix} attachments={[]} />)
    pick(new File(['x'], 'tool.exe', { type: 'application/x-msdownload' }))
    expect(await screen.findByText(/not allowed|type/i)).toBeInTheDocument()
    expect(upload).not.toHaveBeenCalled()
  })

  it('says storage is not configured and sends nothing', async () => {
    render(<AttachmentsCard requestId="r1" uploadPrefix={prefix} attachments={[]} storageConfigured={false} />)
    pick(new File(['x'], 'notes.txt', { type: 'text/plain' }))
    expect(await screen.findByText('File storage is not configured')).toBeInTheDocument()
    expect(upload).not.toHaveBeenCalled()
  })
})
