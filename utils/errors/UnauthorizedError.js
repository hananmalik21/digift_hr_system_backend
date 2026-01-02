import { AppError } from './AppError.js';

/**
 * Unauthorized Error
 * Thrown when authentication is required but missing or invalid
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', technicalMessage = null) {
    super(
      message,
      401,
      'UNAUTHORIZED',
      technicalMessage || message
    );
  }
}

