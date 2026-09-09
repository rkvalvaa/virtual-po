import type { NotificationType } from '@/lib/types/database'

export interface NotificationEmailContent {
  recipientName: string | null
  type: NotificationType
  title: string
  message: string
  link?: string | null
}

const TYPE_LABELS: Record<NotificationType, string> = {
  STATUS_CHANGED: 'Status Update',
  DECISION_MADE: 'Decision Made',
  COMMENT_ADDED: 'New Comment',
  VOTE_RECEIVED: 'New Vote',
  ASSESSMENT_COMPLETE: 'Assessment Complete',
  SECURITY_REVIEW_COMPLETE: 'Security Review Complete',
  REVIEW_NEEDED: 'Review Needed',
  AI_BUDGET_WARNING: 'AI Budget Warning',
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]!)
}

function absoluteApplicationLink(link: string | null | undefined, applicationUrl: string): string | null {
  if (!link) return null
  const base = new URL(applicationUrl)
  const url = new URL(link, base)
  if (!link.startsWith('/') || url.origin !== base.origin) throw new Error('Email links must stay within the application origin.')
  return url.toString()
}

export function renderNotificationEmail(content: NotificationEmailContent, applicationUrl: string) {
  const greeting = content.recipientName ? `Hi ${content.recipientName},` : 'Hi,'
  const link = absoluteApplicationLink(content.link, applicationUrl)
  const linkHtml = link
    ? `<p style="margin-top:16px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 20px;background-color:#171717;color:#fff;text-decoration:none;border-radius:6px;font-size:14px">View details</a></p>`
    : ''

  return {
    subject: `[VPO] ${content.title}`,
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <div style="border-bottom:2px solid #171717;padding-bottom:12px;margin-bottom:20px"><strong style="font-size:16px">Virtual Product Owner</strong></div>
  <p style="margin:0 0 8px">${escapeHtml(greeting)}</p>
  <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(content.title)}</h1>
  <p style="margin:0 0 16px;white-space:pre-wrap">${escapeHtml(content.message)}</p>
  ${linkHtml}
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;font-size:12px;color:#888">
    <p>You received this because you enabled email notifications for &quot;${escapeHtml(TYPE_LABELS[content.type])}&quot; events.</p>
    <p>Manage your preferences in Settings &gt; Email.</p>
  </div>
</body></html>`,
    text: `${greeting}\n\n${content.title}\n\n${content.message}${link ? `\n\nView details: ${link}` : ''}\n\n---\nYou received this because you enabled email notifications for "${TYPE_LABELS[content.type]}" events.\nManage your preferences in Settings > Email.`,
  }
}
