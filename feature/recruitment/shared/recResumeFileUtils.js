import multer from 'multer';

const RESUME_FIELD_NAMES = ['resume_file', 'resume', 'file', 'attachment', 'document'];

/** @returns {import('multer').Multer} */
export function createCandidateResumeMulter() {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, _file, cb) => cb(null, true)
  }).fields(RESUME_FIELD_NAMES.map((name) => ({ name, maxCount: 1 })));
}

/**
 * @param {import('express').Request} req
 * @returns {import('multer').File|null}
 */
export function getUploadedResumeFile(req) {
  const files = req.files;
  if (!files) return null;
  return (
    files.resume_file?.[0] ??
    files.resume?.[0] ??
    files.file?.[0] ??
    files.attachment?.[0] ??
    files.document?.[0] ??
    null
  );
}

/**
 * @param {Record<string, unknown>} body
 */
export function normalizeResumeFileMetadata(body) {
  if (body.file_name == null && body.fileName != null) body.file_name = body.fileName;
  if (body.file_type == null && body.fileType != null) body.file_type = body.fileType;
  if (body.mime_type != null && body.file_type == null) body.file_type = body.mime_type;
  if (body.file_size == null && body.fileSize != null) body.file_size = body.fileSize;
  if (body.file_content == null && body.fileContent != null) body.file_content = body.fileContent;
}

/**
 * @param {unknown} raw
 * @returns {Buffer|null}
 */
export function parseResumeFileContent(raw) {
  if (raw == null || raw === '') return null;
  if (Buffer.isBuffer(raw)) return raw;
  let s = String(raw).trim();
  if (!s) return null;
  const dataUrlMatch = /^data:[^;]+;base64,(.+)$/i.exec(s);
  if (dataUrlMatch) s = dataUrlMatch[1];
  try {
    return Buffer.from(s, 'base64');
  } catch (_) {
    return null;
  }
}

/**
 * Merge multipart upload or base64 file_content into body (same as CREATE_CANDIDATE).
 * @param {import('express').Request} req
 * @param {Record<string, unknown>} body
 */
export function mergeResumeUploadIntoBody(req, body) {
  normalizeResumeFileMetadata(body);
  const uploaded = getUploadedResumeFile(req);
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
}

export function multerResumeUploadErrorMessage(err) {
  if (err.code === 'LIMIT_FILE_SIZE') return 'File too large (max 10MB)';
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return 'Use only one resume field: "resume_file", "resume", "file", "attachment", or "document"';
  }
  return err.message || 'File upload error';
}
