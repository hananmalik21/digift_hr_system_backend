/**
 * Base Application Error Class
 * All custom errors should extend this class
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', technicalMessage = null) {
    super(message);
    
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.userMessage = message; // User-friendly message
    this.technicalMessage = technicalMessage || message; // Technical details
    
    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

