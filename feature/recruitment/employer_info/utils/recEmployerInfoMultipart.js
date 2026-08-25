import multer from 'multer';
import { ValidationError } from '../../../../utils/errors/index.js';
import { LOGO_MAX_BYTES } from './recEmployerInfoConstants.js';
import { MESSAGES } from './recEmployerInfoDb.js';

const LOGO_FIELD = 'logo';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LOGO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname !== LOGO_FIELD) {
      return cb(new ValidationError('Validation failed', [`Unexpected file field; use "${LOGO_FIELD}"`]));
    }
    cb(null, true);
  }
}).single(LOGO_FIELD);

function sendMulterFail(res, message) {
  return res.status(400).json({ success: false, message });
}

function handleMulterResult(err, res, next) {
  if (!err) return next();

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return sendMulterFail(res, `logo file exceeds maximum size (${LOGO_MAX_BYTES} bytes)`);
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return sendMulterFail(res, `Use only the "${LOGO_FIELD}" file field`);
    }
    return sendMulterFail(res, err.message || 'File upload error');
  }

  if (err instanceof ValidationError) {
    const details = Array.isArray(err.errors) ? err.errors.filter(Boolean) : [];
    return sendMulterFail(res, details[0] || err.message || 'Validation failed');
  }

  return sendMulterFail(res, err?.message || 'File upload error');
}

/**
 * Require multipart/form-data for CREATE/UPDATE.
 * Form fields carry employer data; optional file field is "logo"
 * (required only when validateLogoUpload(..., { required: true })).
 */
export function requireEmployerInfoMultipart(req, res, next) {
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('multipart/form-data')) {
    return sendMulterFail(res, MESSAGES.MULTIPART_REQUIRED);
  }
  upload(req, res, (err) => handleMulterResult(err, res, next));
}

/** @param {import('express').Request} req */
export function getUploadedLogoFile(req) {
  return req.file || null;
}
