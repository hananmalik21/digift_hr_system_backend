import {
  createCandidateResumeMulter,
  mergeResumeUploadIntoBody,
  multerResumeUploadErrorMessage
} from '../../shared/recResumeFileUtils.js';
import {
  normalizeCandidateChildJsonRequestFields,
  parseCandidateMultipartChildJsonFields
} from './recCandidateChildJsonUtils.js';

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

/**
 * Normalize req.body from multipart/form-data (and merge uploaded resume into package binds).
 * @param {import('express').Request} req
 * @param {Record<string, unknown>} [extra]
 * @returns {Record<string, unknown>}
 */
export function buildCandidateBodyFromRequest(req, extra = {}) {
  const body = { ...(req.body || {}), ...extra };
  mergeResumeUploadIntoBody(req, body);
  parseCandidateMultipartChildJsonFields(body);
  normalizeCandidateChildJsonRequestFields(body);
  return body;
}
