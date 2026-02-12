import { Resend } from 'resend';
import type { NotificationType } from '@/lib/types/database';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.EMAIL_FROM ?? 'VPO <notifications@updates.example.com>';

interface SendNotificationEmailParams {
  to: string;
  recipientName: string | null;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  requestTitle?: string;
}

const TYPE_LABELS: Record<NotificationType, string> = {
  STATUS_CHANGED: 'Status Update',
  DECISION_MADE: 'Decision Made',
  COMMENT_ADDED: 'New Comment',
  VOTE_RECEIVED: 'New Vote',
  ASSESSMENT_COMPLETE: 'Assessment Complete',
  REVIEW_NEEDED: 'Review Needed',
};

function buildHtml(params: SendNotificationEmailParams): string {
  const greeting = params.recipientName ? `Hi ${params.recipientName},` : 'Hi,';
  const linkHtml = params.link
    ? `<p style="margin-top:16px"><a href="${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}${params.link}" style="display:inline-block;padding:10px 20px;background-color:#171717;color:#fff;text-decoration:none;border-radius:6px;font-size:14px">View Details</a></p>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <div style="border-bottom:2px solid #171717;padding-bottom:12px;margin-bottom:20px">
    <strong style="font-size:16px">Virtual Product Owner</strong>
  </div>
  <p style="margin:0 0 8px">${greeting}</p>
  <p style="margin:0 0 16px">${params.message}</p>
  ${linkHtml}
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;font-size:12px;color:#888">
    <p>You received this because you have email notifications enabled for "${TYPE_LABELS[params.type] ?? params.type}" events.</p>
    <p>Manage your preferences in Settings &gt; Email Notifications.</p>
  </div>
</body>
</html>`;
}

function buildText(params: SendNotificationEmailParams): string {
  const greeting = params.recipientName ? `Hi ${params.recipientName},` : 'Hi,';
  const link = params.link
    ? `\nView details: ${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}${params.link}`
    : '';

  return `${greeting}\n\n${params.message}${link}\n\n---\nYou received this because you have email notifications enabled for "${TYPE_LABELS[params.type] ?? params.type}" events.\nManage your preferences in Settings > Email Notifications.`;
}

export async function sendNotificationEmail(params: SendNotificationEmailParams): Promise<void> {
  if (!resend) {
    // Silently skip if Resend is not configured
    return;
  }

  const subject = `[VPO] ${params.title}`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject,
      html: buildHtml(params),
      text: buildText(params),
    });
  } catch (err) {
    // Log but don't throw — email failures shouldn't break the main flow
    console.error('Failed to send notification email:', err);
  }
}
