import path from 'path';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  RESUME_FILE_TOO_LARGE_MESSAGE,
  RESUME_INVALID_FILE_TYPE_MESSAGE,
  RESUME_REQUIRED_MESSAGE
} from './recApplicationConstants.js';

export const APPLICATION_RESUME_MAX_BYTES = 5 * 1024 * 1024;

export const APPLICATION_RESUME_ALLOWED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx']);

export const APPLICATION_RESUME_ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.msi',
  '.js',
  '.mjs',
  '.cjs',
  '.jar',
  '.sh',
  '.ps1',
  '.vbs',
  '.scr',
  '.dll',
  '.html',
  '.htm',
  '.php',
  '.asp',
  '.aspx',
  '.jsp',
  '.svg',
  '.zip',
  '.rar',
  '.7z'
]);

/**
 * @param {string} fileName
 */
export function resumeExtensionFromFileName(fileName) {
  const ext = path.extname(String(fileName || '').trim()).toLowerCase();
  return ext || null;
}

/**
 * @param {Buffer} buffer
 * @param {string} ext
 */
function contentMatchesExtension(buffer, ext) {
  if (!buffer || buffer.length < 4) return false;
  if (ext === '.pdf') {
    return buffer.slice(0, 4).toString('ascii') === '%PDF';
  }
  if (ext === '.docx') {
    return buffer[0] === 0x50 && buffer[1] === 0x4b;
  }
  if (ext === '.doc') {
    return buffer[0] === 0xd0 && buffer[1] === 0xcf;
  }
  return false;
}

/**
 * @param {Record<string, unknown>} body
 * @returns {{ fileName: string, fileType: string, fileSize: number, fileContent: Buffer }|null}
 */
export function extractApplicationResumeFromBody(body) {
  const b = body || {};
  const raw =
    b.resume_file_content ?? b.resumeFileContent ?? b.file_content ?? b.fileContent ?? b.file;
  if (raw == null || raw === '') return null;

  let fileContent = null;
  if (Buffer.isBuffer(raw)) {
    fileContent = raw;
  } else {
    let s = String(raw).trim();
    if (!s) return null;
    const dataUrlMatch = /^data:[^;]+;base64,(.+)$/i.exec(s);
    if (dataUrlMatch) s = dataUrlMatch[1];
    try {
      fileContent = Buffer.from(s, 'base64');
    } catch (_) {
      return null;
    }
  }

  if (!fileContent || fileContent.length === 0) return null;

  const fileName = String(
    b.resume_file_name ?? b.resumeFileName ?? b.file_name ?? b.fileName ?? 'resume'
  ).trim();
  const fileType = String(
    b.resume_file_type ?? b.resumeFileType ?? b.file_type ?? b.fileType ?? b.mime_type ?? ''
  ).trim();
  const sizeRaw = b.resume_file_size ?? b.resumeFileSize ?? b.file_size ?? b.fileSize;
  const fileSize = sizeRaw != null && sizeRaw !== '' ? Number(sizeRaw) : fileContent.length;

  return {
    fileName: fileName || 'resume',
    fileType: fileType || 'application/octet-stream',
    fileSize: Number.isFinite(fileSize) ? fileSize : fileContent.length,
    fileContent
  };
}

/**
 * @param {string[]} errors
 * @param {Record<string, unknown>} body
 */
export function validateApplicationResumeInErrors(errors, body) {
  const resume = extractApplicationResumeFromBody(body);
  if (!resume) {
    errors.push(RESUME_REQUIRED_MESSAGE);
    return;
  }

  if (resume.fileContent.length > APPLICATION_RESUME_MAX_BYTES) {
    errors.push(RESUME_FILE_TOO_LARGE_MESSAGE);
    return;
  }

  const ext = resumeExtensionFromFileName(resume.fileName);
  if (!ext || !APPLICATION_RESUME_ALLOWED_EXTENSIONS.has(ext)) {
    errors.push(RESUME_INVALID_FILE_TYPE_MESSAGE);
    return;
  }

  if (BLOCKED_EXTENSIONS.has(ext)) {
    errors.push(RESUME_INVALID_FILE_TYPE_MESSAGE);
    return;
  }

  const mime = resume.fileType.toLowerCase().split(';')[0].trim();
  if (mime && !APPLICATION_RESUME_ALLOWED_MIME_TYPES.has(mime)) {
    errors.push(RESUME_INVALID_FILE_TYPE_MESSAGE);
    return;
  }

  if (!contentMatchesExtension(resume.fileContent, ext)) {
    errors.push(RESUME_INVALID_FILE_TYPE_MESSAGE);
  }
}

/**
 * Normalize resume fields on body for Oracle apply_job binds.
 * @param {Record<string, unknown>} body
 */
export function normalizeApplicationResumeFields(body) {
  const resume = extractApplicationResumeFromBody(body);
  if (!resume) return;
  body.resume_file_name = resume.fileName;
  body.resume_file_type = resume.fileType;
  body.resume_file_size = resume.fileSize;
  body.resume_file_content = resume.fileContent;
}

/**
 * @param {Record<string, unknown>} body
 */
export function assertApplicationResumeValid(body) {
  const errors = [];
  validateApplicationResumeInErrors(errors, body);
  if (errors.length) {
    throw new ValidationError('Validation failed', errors);
  }
  normalizeApplicationResumeFields(body);
}
