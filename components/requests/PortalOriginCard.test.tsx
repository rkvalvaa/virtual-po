import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PortalOriginCard } from './PortalOriginCard'

describe('PortalOriginCard', () => {
  it('shows who submitted through which form, and every answer', () => {
    render(<PortalOriginCard origin={{
      reference: 'K7M2Q9XRTA', clientName: 'Nordic Homes', contactEmail: 'kari@nordic.example', contactName: 'Kari',
      formTitle: 'Listing change', formVersion: 2,
      answers: [{ key: 'summary', label: 'Summary', value: 'Fix hero' }, { key: 'volume', label: 'Listings affected', value: 12 }, { key: 'note', label: 'Note', value: null }],
    }} />)
    expect(screen.getByText('Nordic Homes')).toBeInTheDocument()
    expect(screen.getByText(/Kari · kari@nordic.example/)).toBeInTheDocument()
    expect(screen.getByText(/Listing change \(version 2\)/)).toBeInTheDocument()
    expect(screen.getByText('K7M2Q9XRTA')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('Not answered')).toBeInTheDocument()
  })
})
