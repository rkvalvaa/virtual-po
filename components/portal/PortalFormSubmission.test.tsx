import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PortalFormSubmission } from './PortalFormSubmission'
import type { FormDefinition } from '@/lib/forms/definition'

const definition: FormDefinition = {
  title: 'Feedback', instructions: '', titleFieldKey: 'summary', maxAttachments: 0,
  fields: [{ key: 'summary', label: 'Summary', type: 'TEXT', required: true, options: [], showIf: null }],
}

describe('PortalFormSubmission', () => {
  it('sends the answers with a stable submission key and shows the receipt', async () => {
    const user = userEvent.setup()
    const submit = vi.fn(async () => ({ status: 'received' as const, reference: 'K7M2Q9XRTA' }))
    render(<PortalFormSubmission definition={definition} organizationName="Acme" submit={submit} />)
    await user.type(screen.getByLabelText(/Summary/), 'Please fix search')
    await user.click(screen.getByRole('button', { name: 'Submit request' }))

    const formData = (submit.mock.calls[0] as unknown[])[1] as FormData
    expect(formData.get('summary')).toBe('Please fix search')
    expect(formData.get('__submissionKey')).toMatch(/^[0-9a-f-]{36}$/)
    expect(await screen.findByText('K7M2Q9XRTA')).toBeInTheDocument()
    expect(screen.getByText(/Received/)).toBeInTheDocument()
    expect(screen.queryByText(/delivered/i)).not.toBeInTheDocument()
  })

  it('shows field errors and a general error next to the form', async () => {
    const user = userEvent.setup()
    const submit = vi.fn(async () => ({ status: 'invalid' as const, errors: { summary: 'Summary is required' } }))
    render(<PortalFormSubmission definition={definition} organizationName="Acme" submit={submit} />)
    await user.type(screen.getByLabelText(/Summary/), ' ')
    await user.click(screen.getByRole('button', { name: 'Submit request' }))
    expect(await screen.findByText('Summary is required')).toBeInTheDocument()
  })
})
