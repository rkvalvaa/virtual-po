import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormSettings } from './FormSettings'
import { manageForms } from '@/app/(dashboard)/settings/form-actions'
import type { IntakeForm } from '@/lib/db/queries/intake-forms'
vi.mock('@/app/(dashboard)/settings/form-actions', () => ({ manageForms: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const clients = [{ id: 'c1', name: 'Nordic Homes' }]
const draft = {
  title: 'Listing change', instructions: '', titleFieldKey: 'summary', maxAttachments: 3,
  fields: [{ key: 'summary', label: 'Summary', type: 'TEXT' as const, required: true, options: [], showIf: null }],
}
const form: IntakeForm = {
  id: 'f1', audience: 'CLIENT', requestType: 'PRODUCT', clientAccountId: 'c1', clientName: 'Nordic Homes',
  serviceGroupId: null, serviceGroupName: null, destination: null, status: 'DRAFT', version: 0, publishedAt: null, draft, published: null,
}
const groups = [{ id: 'g1', name: 'IT Operations' }]
const internalForm: IntakeForm = {
  ...form, id: 'f2', audience: 'INTERNAL', requestType: 'CHANGE', clientAccountId: null, clientName: null,
  serviceGroupId: 'g1', serviceGroupName: 'IT Operations', draft: { ...draft, title: 'Change request', maxAttachments: 0 },
}

describe('FormSettings', () => {
  it('creates a form for a client', async () => {
    const user = userEvent.setup()
    vi.mocked(manageForms).mockResolvedValue({ success: true })
    render(<FormSettings forms={[]} clients={clients} organizationName="Acme" />)
    await user.type(screen.getByLabelText('Form title'), 'Listing change')
    await user.selectOptions(screen.getByLabelText('Client'), 'c1')
    await user.click(screen.getByRole('button', { name: 'Create form' }))
    expect(manageForms).toHaveBeenCalledWith({ kind: 'create', clientAccountId: 'c1', title: 'Listing change' })
  })

  it('adds a field, saves the draft and previews it with the portal form', async () => {
    const user = userEvent.setup()
    vi.mocked(manageForms).mockResolvedValue({ success: true })
    render(<FormSettings forms={[form]} clients={clients} organizationName="Acme" />)
    await user.click(screen.getByRole('button', { name: 'Edit Listing change' }))
    await user.click(screen.getByRole('button', { name: 'Add field' }))
    await user.type(screen.getByLabelText('Label for field 2'), 'Deadline')
    await user.selectOptions(screen.getByLabelText('Type for field 2'), 'DATE')
    await user.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(manageForms).toHaveBeenCalledWith({ kind: 'saveDraft', id: 'f1', definition: expect.objectContaining({
      fields: [draft.fields[0], { key: 'deadline', label: 'Deadline', type: 'DATE', required: false, options: [], showIf: null }],
    }) })
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(within(preview).getByLabelText(/Deadline/)).toBeInTheDocument()
  })

  it('publishes, and pauses a published form', async () => {
    const user = userEvent.setup()
    vi.mocked(manageForms).mockResolvedValue({ success: true })
    const { rerender } = render(<FormSettings forms={[form]} clients={clients} organizationName="Acme" />)
    await user.click(screen.getByRole('button', { name: 'Edit Listing change' }))
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    expect(manageForms).toHaveBeenCalledWith({ kind: 'publish', id: 'f1' })
    rerender(<FormSettings forms={[{ ...form, status: 'PUBLISHED', version: 1, published: draft }]} clients={clients} organizationName="Acme" />)
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(manageForms).toHaveBeenCalledWith({ kind: 'pause', id: 'f1' })
  })

  it('creates an internal form that files change requests into a service group', async () => {
    const user = userEvent.setup()
    vi.mocked(manageForms).mockResolvedValue({ success: true })
    render(<FormSettings forms={[]} clients={[]} groups={groups} organizationName="Acme" />)
    await user.type(screen.getByLabelText('Internal form title'), 'Change request')
    await user.selectOptions(screen.getByLabelText('Service group'), 'g1')
    await user.click(screen.getByRole('button', { name: 'Create internal form' }))
    expect(manageForms).toHaveBeenCalledWith({ kind: 'createInternal', serviceGroupId: 'g1', title: 'Change request' })
  })

  it('labels internal forms by group and leaves file uploads to the request page', async () => {
    const user = userEvent.setup()
    render(<FormSettings forms={[internalForm]} clients={clients} groups={groups} organizationName="Acme" />)
    expect(screen.getByText(/Internal · IT Operations · change requests/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit Change request' }))
    expect(screen.queryByLabelText(/Attachments allowed/)).not.toBeInTheDocument()
    expect(screen.getByText(/attach files on the request page/i)).toBeInTheDocument()
    expect(screen.getByText('Preview: what members see')).toBeInTheDocument()
  })

  it('picks a Linear team and project for an internal form, or explains Linear is needed', async () => {
    const user = userEvent.setup()
    vi.mocked(manageForms).mockResolvedValue({ success: true })
    const teams = [{ id: 't1', name: 'Ops', projects: [{ id: 'p1', name: 'Infra' }] }, { id: 't2', name: 'Web', projects: [] }]
    const { unmount } = render(<FormSettings forms={[internalForm]} clients={clients} groups={groups} linearTeams={teams} organizationName="Acme" />)
    await user.click(screen.getByRole('button', { name: 'Edit Change request' }))
    expect(screen.getByText(/Not delivered to a tracker/)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Linear team for Change request'), 't1')
    await user.selectOptions(screen.getByLabelText('Linear project for Change request (optional)'), 'p1')
    await user.click(screen.getByRole('button', { name: 'Save destination' }))
    expect(manageForms).toHaveBeenLastCalledWith({ kind: 'setDestination', id: 'f2', teamId: 't1', projectId: 'p1' })
    unmount()

    render(<FormSettings forms={[{ ...internalForm, destination: { integration: 'LINEAR', teamId: 't1', projectId: null } }]} clients={clients} groups={groups} linearTeams={null} organizationName="Acme" />)
    await user.click(screen.getByRole('button', { name: 'Edit Change request' }))
    expect(screen.getByText(/Connect Linear/)).toBeInTheDocument()
    expect(screen.getByText(/Delivered to Linear team t1/)).toBeInTheDocument()
  })
})
