import { AppError } from './AppError.js';

/**
 * Forbidden Error
 * Thrown when user is authenticated but lacks permission
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', technicalMessage = null) {
    super(
      message,
      403,
      'FORBIDDEN',
      technicalMessage || message
    );
  }
}

