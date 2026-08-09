import { AppError, DatabaseError, NotFoundError, ValidationError } from '../../../../utils/errors/index.js';
import { firstValidationMessage } from '../../shared/recControllerHelpers.js';
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
  if (err instanceof ValidationError) {
    return sendFail(res, firstValidationMessage(err), 400);
  }
  if (err instanceof NotFoundError) {
    return sendFail(res, err.userMessage || err.message || MESSAGES.NOT_FOUND, 404);
  }
  if (err instanceof DatabaseError) {
    return sendFail(res, err.userMessage || err.message || fallback, err.statusCode || 500);
  }
  if (err instanceof AppError) {
    return sendFail(res, err.userMessage || err.message || fallback, err.statusCode || 500);
  }
  console.error('[recEmployerInfo]', err?.errorNum != null ? `ORA-${err.errorNum}` : '', '[redacted]');
  return sendFail(res, fallback, 500);
}
