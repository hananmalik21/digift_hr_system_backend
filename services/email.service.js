import nodemailer from 'nodemailer';

let transporter = null;

function readMailConfig() {
  return {
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT, 10) || 587,
    secure: process.env.MAIL_SECURE === 'true',
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
    from: process.env.MAIL_FROM
  };
}

function getTransporter() {
  if (transporter) return transporter;

  const { host, port, secure, user, pass } = readMailConfig();
  if (!host || !user || !pass) {
    throw new Error(
      'Mail configuration is incomplete. Check MAIL_HOST, MAIL_USER, and MAIL_PASS in .env'
    );
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });

  return transporter;
}

/**
 * @param {unknown} attachments
 * @returns {Array<{ filename: string, content: Buffer|string, contentType?: string }>}
 */
function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];
  return attachments
    .filter((a) => a && a.content != null)
    .map((a) => ({
      filename: a.filename || 'document',
      content: a.content,
      ...(a.contentType ? { contentType: a.contentType } : {})
    }));
}

/**
 * Send an email via configured SMTP (Brevo).
 * @param {{
 *   to: string,
 *   subject: string,
 *   text?: string,
 *   html?: string,
 *   replyTo?: string,
 *   attachments?: Array<{ filename: string, content: Buffer|string, contentType?: string }>
 * }} options
 * @returns {Promise<{ success: true, messageId: string } | { success: false, error: string }>}
 */
export async function sendEmail({ to, subject, text, html, replyTo, attachments }) {
  const recipient = typeof to === 'string' ? to.trim() : '';
  try {
    if (!recipient) {
      throw new Error('Recipient email "to" is required');
    }
    if (!subject || !String(subject).trim()) {
      throw new Error('Email subject is required');
    }

    const { from: mailFrom } = readMailConfig();
    if (!mailFrom) {
      throw new Error('MAIL_FROM is not set in .env');
    }

    const mailAttachments = normalizeAttachments(attachments);
    const info = await getTransporter().sendMail({
      from: mailFrom,
      to: recipient,
      subject: String(subject).trim(),
      text,
      html,
      ...(replyTo ? { replyTo } : {}),
      ...(mailAttachments.length ? { attachments: mailAttachments } : {})
    });

    console.log(
      `[email] Sent to ${recipient} | messageId: ${info.messageId}` +
        (mailAttachments.length ? ` | attachments: ${mailAttachments.length}` : '')
    );
    return { success: true, messageId: info.messageId };
  } catch (error) {
    const message = error?.message || 'Unknown email error';
    console.error(`[email] Failed to send to ${recipient || '(missing)'}:`, message);
    return { success: false, error: message };
  }
}

/** Reset cached transporter (useful for tests). */
export function resetEmailTransporter() {
  transporter = null;
}
