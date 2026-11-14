// Outbound mail for the password-reset flow.
//
// The transporter is built lazily so the API still boots (and every other
// feature still works) on an instance with no SMTP configured — a missing mail
// account is a reason password reset cannot run, not a reason the app cannot start.

import nodemailer from 'nodemailer';

import { mailConfig, mailConfigured } from '../config/env.js';

let transporter = null;

function getTransport() {
  const cfg = mailConfig();
  if (!mailConfigured()) {
    const err = new Error('Password reset email is not available on this server: SMTP is not configured');
    err.status = 503;
    err.code = 'mail_unavailable';
    throw err;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
      pool: true,
      maxConnections: 2,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000
    });
  }
  return transporter;
}

export function mailStatus() {
  const cfg = mailConfig();
  return { configured: mailConfigured(), from: cfg.from, echoInConsole: cfg.echoInConsole };
}

export async function sendMail({ to, subject, text, html }) {
  const cfg = mailConfig();
  const info = await getTransport().sendMail({
    from: cfg.from,
    to,
    subject,
    text,
    html,
    // A reset link is time-boxed anyway; not caching keeps a re-request honest.
    headers: { 'X-Entity-Ref-ID': `reset-${Date.now()}` }
  });
  return { messageId: info?.messageId || null };
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

// The reset email. `link` is only ever built here, so no caller can accidentally
// interpolate raw HTML around a token.
export function resetEmailBody({ fullName, link, minutes, appBaseUrl }) {
  const name = String(fullName || '').split(/\s+/)[0] || 'there';
  const safeLink = escapeHtml(link);
  return {
    subject: 'Reset your VoicePitch AI password',
    text: [
      `Hi ${name},`,
      '',
      'Someone asked to reset the password for the VoicePitch AI account tied to this email address.',
      '',
      `Reset it with this link (valid for ${minutes} minutes, and usable once):`,
      link,
      '',
      `If the button does not work, paste the link into your browser and open ${appBaseUrl}/reset-password`,
      '',
      'If you did not ask for this, ignore the email — your current password keeps working.'
    ].join('\n'),
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#0f1726;color:#e9eef6;border-radius:14px;border:1px solid #24314a">
  <p style="margin:0 0 6px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#6c7c98">VoicePitch AI</p>
  <h1 style="margin:0 0 14px;font-size:19px">Reset your password</h1>
  <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#a8b5cb">Hi ${escapeHtml(name)}, someone asked to reset the password for the account tied to this email address.</p>
  <p style="margin:0 0 18px"><a href="${safeLink}" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 18px;border-radius:10px">Choose a new password</a></p>
  <p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:#a8b5cb">The link is valid for ${Number(minutes) || 30} minutes and can only be used once. If the button does not work, copy this address into your browser:</p>
  <p style="margin:0 0 18px;font-size:12px;line-height:1.5;word-break:break-all;color:#8195b3"><a href="${safeLink}" style="color:#8195b3">${safeLink}</a></p>
  <p style="margin:0;font-size:12px;line-height:1.6;color:#6c7c98">Did not ask for this? Ignore the email — your current password keeps working.</p>
</div>`
  };
}
