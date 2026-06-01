import multer from 'multer';
import { ValidationError } from '../../../../utils/errors/index.js';

const JSON_ARRAY_FIELDS = ['education_json', 'experience_json'];

const uploadCandidate = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, _file, cb) => cb(null, true)
}).fields([
  { name: 'resume', maxCount: 1 },
  { name: 'file', maxCount: 1 },
  { name: 'attachment', maxCount: 1 },
  { name: 'document', maxCount: 1 }
]);

/**
 * Run multer only for multipart/form-data so JSON clients keep working.
 */
export function maybeMulterCandidate(req, res, next) {
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }
  uploadCandidate(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'File too large (max 10MB)'
          : err.code === 'LIMIT_UNEXPECTED_FILE'
            ? 'Use only one resume field: "resume", "file", "attachment", or "document"'
            : err.message || 'File upload error';
      return res.status(400).json({ success: false, message });
    }
    next();
  });
}

function getUploadedFile(req) {
  const files = req.files;
  if (!files) return null;
  return (
    files.resume?.[0] ??
    files.file?.[0] ??
    files.attachment?.[0] ??
    files.document?.[0] ??
    null
  );
}

function normalizeFileMetadata(body) {
  if (body.file_name == null && body.fileName != null) body.file_name = body.fileName;
  if (body.file_type == null && body.fileType != null) body.file_type = body.fileType;
  if (body.mime_type != null && body.file_type == null) body.file_type = body.mime_type;
  if (body.file_size == null && body.fileSize != null) body.file_size = body.fileSize;
  if (body.file_content == null && body.fileContent != null) body.file_content = body.fileContent;
}

function parseJsonArrayField(value, fieldName) {
  if (value == null || value === '') return null;
  if (Array.isArray(value)) return value.length === 0 ? null : value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.length === 0 ? null : parsed;
    if (parsed && typeof parsed === 'object') {
      return Object.keys(parsed).length === 0 ? null : parsed;
    }
    throw new ValidationError('Validation failed', [`${fieldName} must be a JSON array`]);
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    throw new ValidationError('Validation failed', [`${fieldName} must be valid JSON`]);
  }
}

/**
 * Normalize req.body from multipart/form-data (and merge uploaded resume into package binds).
 * @param {import('express').Request} req
 * @param {Record<string, unknown>} [extra]
 * @returns {Record<string, unknown>}
 */
export function buildCandidateBodyFromRequest(req, extra = {}) {
  const body = { ...(req.body || {}), ...extra };
  normalizeFileMetadata(body);

  for (const field of JSON_ARRAY_FIELDS) {
    if (body[field] != null && body[field] !== '') {
      body[field] = parseJsonArrayField(body[field], field);
    }
  }

  const uploaded = getUploadedFile(req);
  if (uploaded) {
    body.file_content = uploaded.buffer;
    if (body.file_name == null || String(body.file_name).trim() === '') {
      body.file_name = uploaded.originalname || 'resume';
    }
    if (body.file_type == null || String(body.file_type).trim() === '') {
      body.file_type = uploaded.mimetype || 'application/octet-stream';
    }
    if (body.file_size == null || body.file_size === '') {
      body.file_size = uploaded.size;
    }
  }

  return body;
}
