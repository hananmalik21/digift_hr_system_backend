import { AppError } from '@digifyhr/common';
import { ERROR_CODES } from '../constants/currency.constants.js';

/**
 * Keeps convert errors on `{ success: false, message, code }` for Flutter.
 * 4xx is a client problem and is not logged as a server error.
 */
export function currencyErrorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof AppError) {
    const statusCode = err.statusCode || 500;
    if (statusCode >= 500) {
      console.error('[currency]', err.code, err.technicalMessage || err.message);
    }
    const body = {
      success: false,
      message: err.userMessage || err.message || 'Request failed',
    };
    if (err.code && err.code !== ERROR_CODES.INTERNAL_ERROR) {
      body.code = err.code;
    }
    return res.status(statusCode).json(body);
  }

  console.error('[currency] Unhandled error:', err?.stack || err);
  return res.status(500).json({
    success: false,
    code: ERROR_CODES.INTERNAL_ERROR,
    message: 'Internal server error',
  });
}
