// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { renderNotificationEmail } from './render'

describe('notification email rendering', () => {
  it('escapes every untrusted HTML value and produces a validated absolute link', () => {
    const rendered = renderNotificationEmail({
      recipientName: '<img src=x onerror=alert(1)>',
      type: 'COMMENT_ADDED',
      title: '<script>alert(1)</script>',
      message: '<b>owned</b> & goodbye',
      link: '/requests/123?next=<bad>',
    }, 'https://vpo.example.test')

    expect(rendered.subject).toBe('[VPO] <script>alert(1)</script>')
    expect(rendered.html).not.toContain('<script>')
    expect(rendered.html).not.toContain('<img')
    expect(rendered.html).not.toContain('<b>')
    expect(rendered.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(rendered.html).toContain('https://vpo.example.test/requests/123?next=%3Cbad%3E')
    expect(rendered.text).toContain('<b>owned</b> & goodbye')
  })

  it('refuses links that leave the configured application origin', () => {
    expect(() => renderNotificationEmail({
      recipientName: null,
      type: 'STATUS_CHANGED',
      title: 'Changed',
      message: 'Changed',
      link: 'https://evil.example/steal',
    }, 'https://vpo.example.test')).toThrow('application origin')
  })
})
