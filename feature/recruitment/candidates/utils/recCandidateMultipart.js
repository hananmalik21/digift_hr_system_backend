import { ValidationError } from '../../../../utils/errors/index.js';
import {
  createCandidateResumeMulter,
  mergeResumeUploadIntoBody,
  multerResumeUploadErrorMessage
} from '../../shared/recResumeFileUtils.js';

const JSON_ARRAY_FIELDS = ['education_json', 'experience_json'];

const uploadCandidate = createCandidateResumeMulter();

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
      return res.status(400).json({
        success: false,
        message: multerResumeUploadErrorMessage(err)
      });
    }
    next();
  });
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
  mergeResumeUploadIntoBody(req, body);

  for (const field of JSON_ARRAY_FIELDS) {
    if (body[field] != null && body[field] !== '') {
      body[field] = parseJsonArrayField(body[field], field);
    }
  }

  return body;
}
