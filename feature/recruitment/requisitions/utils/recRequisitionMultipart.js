import multer from 'multer';
import { ValidationError } from '../../../../utils/errors/index.js';

const JSON_ARRAY_FIELDS = ['skills_json', 'interview_panel_json'];

const uploadRequisition = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, _file, cb) => cb(null, true)
}).fields([
  { name: 'file', maxCount: 1 },
  { name: 'attachment', maxCount: 1 },
  { name: 'document', maxCount: 1 }
]);

/**
 * Run multer only for multipart/form-data so JSON clients keep working.
 */
export function maybeMulterRequisition(req, res, next) {
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }
  uploadRequisition(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'File too large (max 10MB)'
          : err.code === 'LIMIT_UNEXPECTED_FILE'
            ? 'Use only one file field: "file", "attachment", or "document"'
            : err.message || 'File upload error';
      return res.status(400).json({ success: false, message });
    }
    next();
  });
}

function getUploadedFile(req) {
  const files = req.files;
  if (!files) return null;
  return files.file?.[0] ?? files.attachment?.[0] ?? files.document?.[0] ?? null;
}

function normalizeFileMetadata(body) {
  if (body.file_name == null && body.fileName != null) body.file_name = body.fileName;
  if (body.mime_type == null && body.mimeType != null) body.mime_type = body.mimeType;
  if (body.file_size == null && body.fileSize != null) body.file_size = body.fileSize;
  if (body.file_content == null && body.fileContent != null) body.file_content = body.fileContent;
}

/** @param {Record<string, unknown>} body */
export function hasRequisitionFile(body) {
  const b = body || {};
  const raw = b.file_content ?? b.fileContent ?? b.file;
  if (raw == null || raw === '') return false;
  if (Buffer.isBuffer(raw)) return raw.length > 0;
  const s = String(raw).trim();
  if (!s) return false;
  const dataUrlMatch = /^data:[^;]+;base64,(.+)$/i.exec(s);
  const payload = dataUrlMatch ? dataUrlMatch[1] : s;
  try {
    return Buffer.from(payload, 'base64').length > 0;
  } catch (_) {
    return false;
  }
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
 * Normalize req.body from multipart/form-data (and merge uploaded file into package binds).
 * @param {import('express').Request} req
 * @param {Record<string, unknown>} [extra]
 * @returns {Record<string, unknown>}
 */
export function buildRequisitionBodyFromRequest(req, extra = {}) {
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
      body.file_name = uploaded.originalname || 'attachment';
    }
    if (body.mime_type == null || String(body.mime_type).trim() === '') {
      body.mime_type = uploaded.mimetype || 'application/octet-stream';
    }
    if (body.file_size == null || body.file_size === '') {
      body.file_size = uploaded.size;
    }
  }

  return body;
}
