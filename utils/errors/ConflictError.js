import { AppError } from './AppError.js';

/**
 * Conflict Error
 * Thrown when there's a conflict (e.g., unique constraint violation)
 */
export class ConflictError extends AppError {
  constructor(message = 'Conflict occurred', constraint = null, columns = null, technicalMessage = null) {
    super(
      message,
      409,
      'CONFLICT',
      technicalMessage || message
    );
    
    this.constraint = constraint;
    this.columns = columns;
  }
}

