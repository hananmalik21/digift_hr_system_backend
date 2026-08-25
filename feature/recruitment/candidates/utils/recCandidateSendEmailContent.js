/**
 * Escape plain text for safe HTML email bodies.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build a simple HTML body from plain-text message content.
 * @param {string} message
 * @returns {string}
 */
export function buildPlainTextEmailHtml(message) {
  const safe = escapeHtml(message).replace(/\r\n|\r|\n/g, '<br>');
  return [
    '<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">',
    `<p>${safe}</p>`,
    '</div>'
  ].join('');
}

/**
 * @param {Array<{ filename?: string, contentType?: string, size?: number }>} attachments
 * @returns {Array<{ filename: string, contentType: string|null, size: number|null }>}
 */
export function mapAttachmentMeta(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];
  return attachments.map((a) => ({
    filename: a.filename || 'document',
    contentType: a.contentType ?? null,
    size: a.size ?? null
  }));
}
