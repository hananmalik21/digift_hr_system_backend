import { Router } from 'express';
import { sendEmail } from '../services/email.service.js';
import { buildPlainTextEmailHtml } from '../feature/recruitment/candidates/utils/recCandidateSendEmailContent.js';

const router = Router();

router.post('/test-email', async (req, res) => {
  const { to } = req.body ?? {};

  if (!to || typeof to !== 'string' || !to.trim()) {
    console.warn('[api] POST /api/test-email rejected: missing "to"');
    return res.status(400).json({
      success: false,
      message: 'Recipient email "to" is required'
    });
  }

  const recipient = to.trim();
  console.log(`[api] POST /api/test-email -> ${recipient}`);

  const text =
    'This is a test email from Digify ERP using Brevo SMTP.\n\n' +
    'If you received this message, your email configuration is working correctly.';

  const result = await sendEmail({
    to: recipient,
    subject: 'Test Email from Digify ERP',
    text,
    html: buildPlainTextEmailHtml(text)
  });

  if (result.success) {
    return res.json({
      success: true,
      message: 'Email sent successfully',
      messageId: result.messageId
    });
  }

  return res.status(500).json({
    success: false,
    message: result.error
  });
});

export default router;
