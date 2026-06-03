import multer from 'multer';
import { RESUME_FILE_TOO_LARGE_MESSAGE } from './recApplicationConstants.js';
import { APPLICATION_RESUME_MAX_BYTES } from './recApplicationResumeValidation.js';
import { mergeResumeUploadIntoBody, multerResumeUploadErrorMessage } from '../../shared/recResumeFileUtils.js';

const uploadApplyResume = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: APPLICATION_RESUME_MAX_BYTES },
  fileFilter: (_req, _file, cb) => cb(null, true)
}).fields([
  { name: 'resume_file', maxCount: 1 },
  { name: 'resume', maxCount: 1 },
  { name: 'file', maxCount: 1 },
  { name: 'attachment', maxCount: 1 },
  { name: 'document', maxCount: 1 }
]);

/**
 * Parse multipart/form-data for apply job (JSON clients skip multer).
 */
export function maybeMulterApplyJob(req, res, next) {
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }
  uploadApplyResume(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? RESUME_FILE_TOO_LARGE_MESSAGE
          : multerResumeUploadErrorMessage(err);
      return res.status(400).json({ success: false, message });
    }
    next();
  });
}

/**
 * @param {import('express').Request} req
 * @param {Record<string, unknown>} [extra]
 */
export function buildApplyJobBodyFromRequest(req, extra = {}) {
  const body = { ...(req.body || {}), ...extra };
  mergeResumeUploadIntoBody(req, body);

  if (body.file_name != null && body.resume_file_name == null) {
    body.resume_file_name = body.file_name;
  }
  if (body.file_type != null && body.resume_file_type == null) {
    body.resume_file_type = body.file_type;
  }
  if (body.mime_type != null && body.resume_file_type == null) {
    body.resume_file_type = body.mime_type;
  }
  if (body.file_size != null && body.resume_file_size == null) {
    body.resume_file_size = body.file_size;
  }
  if (body.file_content != null && body.resume_file_content == null) {
    body.resume_file_content = body.file_content;
  }

  return body;
}
