import multer from 'multer';
import {
  SEND_EMAIL_FILE_FIELDS,
  SEND_EMAIL_MAX_FILE_SIZE,
  SEND_EMAIL_MAX_FILES
} from './recCandidateSendEmailConstants.js';

const uploadSendEmail = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: SEND_EMAIL_MAX_FILE_SIZE,
    files: SEND_EMAIL_MAX_FILES
  },
  fileFilter: (_req, _file, cb) => cb(null, true)
}).fields(SEND_EMAIL_FILE_FIELDS.map((name) => ({ name, maxCount: SEND_EMAIL_MAX_FILES })));

function multerUploadErrorMessage(err) {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return 'File too large (max 10MB)';
  }
  if (err?.code === 'LIMIT_FILE_COUNT' || err?.code === 'LIMIT_UNEXPECTED_FILE') {
    return `Too many files (max ${SEND_EMAIL_MAX_FILES}). Use field "${SEND_EMAIL_FILE_FIELDS.join('", "')}".`;
  }
  return err?.message || 'File upload error';
}

/**
 * Run multer only for multipart/form-data so JSON clients keep working.
 */
export function maybeMulterSendCandidateEmail(req, res, next) {
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }
  uploadSendEmail(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: multerUploadErrorMessage(err)
      });
    }
    next();
  });
}

/**
 * Collect uploaded files from send-email multipart request.
 * @param {import('express').Request} req
 * @returns {Array<{ filename: string, content: Buffer, contentType: string, size: number }>}
 */
export function getSendCandidateEmailAttachments(req) {
  const files = req.files;
  if (!files || typeof files !== 'object') return [];

  const collected = SEND_EMAIL_FILE_FIELDS.flatMap((field) => files[field] || []);
  const seen = new Set();
  const attachments = [];

  for (const f of collected) {
    if (!f?.buffer) continue;
    const filename = String(f.originalname || 'document').trim() || 'document';
    const contentType = f.mimetype || 'application/octet-stream';
    const key = `${filename}:${f.size}:${contentType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    attachments.push({
      filename,
      content: f.buffer,
      contentType,
      size: f.size
    });
  }

  return attachments.slice(0, SEND_EMAIL_MAX_FILES);
}
