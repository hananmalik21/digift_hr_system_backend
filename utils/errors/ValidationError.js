import { AppError } from './AppError.js';

/**
 * Validation Error
 * Thrown when request validation fails
 */
export class ValidationError extends AppError {
  constructor(message, errors = null, technicalMessage = null) {
    super(
      message || 'Validation failed',
      400,
      'VALIDATION_ERROR',
      technicalMessage || message
    );
    
    this.errors = errors; // Array of validation error messages
  }
}

