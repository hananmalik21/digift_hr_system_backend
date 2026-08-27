import { AppError, DatabaseError, NotFoundError, ValidationError } from '../../../../utils/errors/index.js';
import {
  firstValidationMessage,
  handlePortalError
} from '../../shared/recControllerHelpers.js';
import { MESSAGES, packageStatusIsSuccess } from './recEmployerInfoDb.js';

export { packageStatusIsSuccess };

/**
 * Map Oracle package failure messages to HTTP status codes.
 * Preserves package business messages.
 * @param {string|null|undefined} message
 * @returns {number}
 */
export function packageFailureHttpStatus(message) {
  const msg = String(message ?? '');
  if (/already exists for the selected company/i.test(msg)) return 409;
  if (/enterprise-level employer information already exists/i.test(msg)) return 409;
  if (/already exists|duplicate/i.test(msg)) return 409;
  if (/not found/i.test(msg)) return 404;
  return 400;
}

export function sendOk(res, message, data = null, httpStatus = 200) {
  return res.status(httpStatus).json({ success: true, message, data });
}

export function sendFail(res, message, httpStatus = 400, data = null) {
  const body = { success: false, message: message || MESSAGES.FALLBACK };
  if (data != null) body.data = data;
  return res.status(httpStatus).json(body);
}

/**
 * Serve logo bytes for public viewing (inline; CORS-friendly for <img src>).
 * @param {import('express').Response} res
 * @param {{ logo: Buffer, logo_file_name?: string, logo_mime_type?: string }} file
 */
export function sendLogoBinary(res, file) {
  const rawName = String(file.logo_file_name || 'logo').trim() || 'logo';
  const asciiName = rawName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  const utf8Name = encodeURIComponent(rawName);

  res.setHeader('Content-Type', file.logo_mime_type || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`
  );
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Length', String(file.logo.length));
  return res.status(200).send(file.logo);
}

/**
 * @param {import('express').Response} res
 * @param {{ status?: string, message?: string, data?: unknown }|null|undefined} pkg
 * @param {{ successMessage?: string, successHttpStatus?: number, data?: unknown }} [options]
 */
export function sendPackageOutcome(res, pkg, { successMessage, successHttpStatus = 200, data } = {}) {
  if (!packageStatusIsSuccess(pkg?.status)) {
    const message = pkg?.message || MESSAGES.FALLBACK;
    return sendFail(res, message, packageFailureHttpStatus(message));
  }
  return sendOk(
    res,
    successMessage || pkg?.message || 'Operation completed successfully.',
    data !== undefined ? data : pkg?.data ?? null,
    successHttpStatus
  );
}

export function handleEmployerInfoError(res, err, fallback = MESSAGES.FALLBACK) {
  // DatabaseError can carry a non-500 status; handle before shared portal path.
  if (err instanceof DatabaseError) {
    return sendFail(res, err.userMessage || err.message || fallback, err.statusCode || 500);
  }
  if (err instanceof AppError && !(err instanceof ValidationError) && !(err instanceof NotFoundError)) {
    return sendFail(res, err.userMessage || err.message || fallback, err.statusCode || 500);
  }
  return handlePortalError(res, err, fallback);
}
