/**
 * Error Classes and Handlers
 * Export all error-related utilities
 */
export {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError
} from '@digifyhr/common';
export { DatabaseError } from './DatabaseError.js';
export { formatErrorResponse, sendErrorResponse } from './errorHandler.js';

