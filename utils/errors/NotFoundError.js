import { AppError } from './AppError.js';

/**
 * Not Found Error
 * Thrown when a requested resource is not found
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', technicalMessage = null) {
    super(
      message,
      404,
      'NOT_FOUND',
      technicalMessage || message
    );
  }
}

