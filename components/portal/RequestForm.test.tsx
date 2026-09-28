import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RequestForm } from './RequestForm'
import type { FormDefinition } from '@/lib/forms/definition'

const definition: FormDefinition = {
  title: 'Change a listing page',
  instructions: 'Tell us what should change.',
  titleFieldKey: 'summary',
  maxAttachments: 2,
  fields: [
    { key: 'summary', label: 'Summary', type: 'TEXT', required: true, options: [], showIf: null },
    { key: 'area', label: 'Area', type: 'SELECT', required: true, options: ['Listings', 'Search'], showIf: null },
    { key: 'listing_url', label: 'Listing URL', type: 'TEXT', required: true, options: [], showIf: { fieldKey: 'area', equals: 'Listings' } },
    { key: 'details', label: 'Details', type: 'LONG_TEXT', required: false, options: [], showIf: null },
  ],
}

describe('RequestForm', () => {
  it('shows the organization, title, instructions and required markers', () => {
    render(<RequestForm definition={definition} organizationName="Acme Portal" preview />)
    expect(screen.getByRole('heading', { name: 'Change a listing page' })).toBeInTheDocument()
    expect(screen.getByText('Acme Portal')).toBeInTheDocument()
    expect(screen.getByText('Tell us what should change.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Summary/)).toBeRequired()
    expect(screen.getByLabelText(/Details/)).not.toBeRequired()
  })

  it('reveals a conditional field only when its condition is met', async () => {
    const user = userEvent.setup()
    render(<RequestForm definition={definition} organizationName="Acme Portal" preview />)
    expect(screen.queryByLabelText(/Listing URL/)).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(/Area/), 'Listings')
    expect(screen.getByLabelText(/Listing URL/)).toBeRequired()
    await user.selectOptions(screen.getByLabelText(/Area/), 'Search')
    expect(screen.queryByLabelText(/Listing URL/)).not.toBeInTheDocument()
  })

  it('cannot be submitted in preview', () => {
    render(<RequestForm definition={definition} organizationName="Acme Portal" preview />)
    expect(screen.getByRole('button', { name: /Submit/ })).toBeDisabled()
  })
})
