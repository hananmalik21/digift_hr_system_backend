import {
  createCandidateResumeMulter,
  mergeResumeUploadIntoBody,
  multerResumeUploadErrorMessage
} from '../../shared/recResumeFileUtils.js';
import { PORTAL_DEFAULT_CREATED_BY } from './recCandidatePortalConstants.js';

const uploadRegisterResume = createCandidateResumeMulter();

/**
 * Career portal registration accepts multipart/form-data (resume optional).
 * JSON with base64 file_content is also supported when Content-Type is not multipart.
 */
export function multerRegisterCandidate(req, res, next) {
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }
  uploadRegisterResume(req, res, (err) => {
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
 * @param {import('express').Request} req
 * @param {Record<string, unknown>} [extra]
 */
export function buildRegisterBodyFromRequest(req, extra = {}) {
  const body = { ...(req.body || {}), ...extra };
  mergeResumeUploadIntoBody(req, body);
  if (body.created_by == null || String(body.created_by).trim() === '') {
    body.created_by = PORTAL_DEFAULT_CREATED_BY;
  }
  return body;
}
