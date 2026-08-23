import { AppError } from '../../utils/errors/AppError.js';
import { ERROR_CODES } from '../constants/currency.constants.js';

/**
 * Maps currency-module errors to `{ success: false, message, code }`.
 * Unexpected errors stay 500 without leaking internals.
 */
export function currencyErrorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof AppError) {
    console.error('[currency]', err.code, err.message);
    const body = {
      success: false,
      message: err.userMessage || err.message || 'Request failed',
    };
    if (err.code && err.code !== ERROR_CODES.INTERNAL_ERROR) {
      body.code = err.code;
    }
    return res.status(err.statusCode || 500).json(body);
  }

  console.error('[currency] Unhandled error:', err?.stack || err);
  return res.status(500).json({
    success: false,
    code: ERROR_CODES.INTERNAL_ERROR,
    message: 'Internal server error',
  });
}
